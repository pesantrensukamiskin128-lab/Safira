/**
 * Prisma-compatible database client menggunakan mysql2 murni.
 * Menggantikan Prisma ORM untuk menghindari Rust binary engine
 * yang tidak kompatibel dengan Hostinger shared hosting.
 *
 * Mengimplementasikan semua method Prisma yang dipakai di aplikasi ini.
 */

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

// ── Connection Pool ────────────────────────────────────────────────────────
function parseDbUrl(url) {
  const u = new URL(url);
  const host = u.hostname === 'localhost' ? '127.0.0.1' : u.hostname; // force IPv4
  return {
    host,
    port:     parseInt(u.port) || 3306,
    user:     decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

let pool = null;
function getPool() {
  if (!pool) {
    const cfg = parseDbUrl(process.env.DATABASE_URL || '');
    pool = mysql.createPool({
      ...cfg,
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
      charset:            'utf8mb4',
      timezone:           '+00:00',
      dateStrings:        false,
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

// ── Tabel yang punya kolom updatedAt ─────────────────────────────────────
const HAS_UPDATED_AT = new Set([
  'agenda', 'disposisi', 'organisasiprofil', 'suratkeluar',
  'suratmasuk', 'templatesurat', 'user',
]);
// MySQL di Linux Hostinger: nama tabel lowercase (case-sensitive)
const TABLE_MAP = {
  user:             'user',
  suratKeluar:      'suratkeluar',
  suratMasuk:       'suratmasuk',
  organisasiProfil: 'organisasiprofil',
  disposisi:        'disposisi',
  notifikasi:       'notifikasi',
  agenda:           'agenda',
  kehadiran:        'kehadiran',
  pesertaAgenda:    'pesertaagenda',
  penerimaInternal: 'penerimainternal',
  pushSubscription: 'pushsubscription',
  templateSurat:    'templatesurat',
};

// ── WHERE builder ──────────────────────────────────────────────────────────
function buildWhere(where, params) {
  if (!where || Object.keys(where).length === 0) return '1=1';
  const parts = [];

  for (const [key, val] of Object.entries(where)) {
    if (key === 'OR') {
      const orParts = val.map(cond => `(${buildWhere(cond, params)})`);
      parts.push(`(${orParts.join(' OR ')})`);
    } else if (key === 'AND') {
      const andParts = val.map(cond => `(${buildWhere(cond, params)})`);
      parts.push(`(${andParts.join(' AND ')})`);
    } else if (key === 'NOT') {
      parts.push(`NOT (${buildWhere(val, params)})`);
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      // Prisma operators
      for (const [op, opVal] of Object.entries(val)) {
        if (op === 'equals')     { parts.push(`\`${key}\` = ?`);    params.push(opVal); }
        else if (op === 'not')   {
          if (opVal === null) { parts.push(`\`${key}\` IS NOT NULL`); }
          else { parts.push(`\`${key}\` != ?`); params.push(opVal); }
        }
        else if (op === 'in')    { parts.push(`\`${key}\` IN (${opVal.map(() => '?').join(',')})`); params.push(...opVal); }
        else if (op === 'notIn') { parts.push(`\`${key}\` NOT IN (${opVal.map(() => '?').join(',')})`); params.push(...opVal); }
        else if (op === 'lt')    { parts.push(`\`${key}\` < ?`);   params.push(opVal); }
        else if (op === 'lte')   { parts.push(`\`${key}\` <= ?`);  params.push(opVal); }
        else if (op === 'gt')    { parts.push(`\`${key}\` > ?`);   params.push(opVal); }
        else if (op === 'gte')   { parts.push(`\`${key}\` >= ?`);  params.push(opVal); }
        else if (op === 'contains')   { parts.push(`\`${key}\` LIKE ?`); params.push(`%${opVal}%`); }
        else if (op === 'startsWith') { parts.push(`\`${key}\` LIKE ?`); params.push(`${opVal}%`); }
        else if (op === 'endsWith')   { parts.push(`\`${key}\` LIKE ?`); params.push(`%${opVal}`); }
        else if (op === 'some')  {
          // Relasi nested — skip, handled by caller or ignored
        }
        else if (op === 'mode')  { /* case sensitivity — MySQL default is case-insensitive */ }
      }
    } else if (val === null) {
      parts.push(`\`${key}\` IS NULL`);
    } else if (Array.isArray(val)) {
      if (val.length === 0) parts.push('1=0');
      else { parts.push(`\`${key}\` IN (${val.map(() => '?').join(',')})`); params.push(...val); }
    } else {
      parts.push(`\`${key}\` = ?`);
      params.push(val);
    }
  }

  return parts.length ? parts.join(' AND ') : '1=1';
}

// ── ORDER BY builder ───────────────────────────────────────────────────────
function buildOrderBy(orderBy) {
  if (!orderBy) return '';
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts = orders.map(o => {
    const [col, dir] = Object.entries(o)[0];
    return `\`${col}\` ${dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`;
  });
  return parts.length ? `ORDER BY ${parts.join(', ')}` : '';
}

// ── SELECT builder ─────────────────────────────────────────────────────────
function buildSelect(select, table) {
  if (!select) return `\`${table}\`.*`;
  return Object.keys(select)
    .filter(k => select[k] === true)
    .map(k => `\`${table}\`.\`${k}\``)
    .join(', ') || `\`${table}\`.*`;
}

// ── Date serializer ────────────────────────────────────────────────────────
function serializeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = v;
    } else if (Buffer.isBuffer(v)) {
      // mysql2 kadang return TINYINT(1) / BIT sebagai Buffer
      out[k] = v.length === 1 ? v[0] === 1 : v.toString();
    } else if (v instanceof Date) {
      out[k] = v;
    } else if (typeof v === 'object' && v.constructor && v.constructor.name === 'Date') {
      out[k] = new Date(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Include resolver ───────────────────────────────────────────────────────
// Resolves Prisma include: loads related rows and attaches them
async function resolveIncludes(rows, include, modelName) {
  if (!include || !rows || rows.length === 0) return rows;

  const isArr = Array.isArray(rows);
  const arr   = isArr ? rows : [rows];

  for (const [rel, relOpts] of Object.entries(include)) {
    if (!relOpts) continue;

    // Get relation config
    const relConfig = getRelationConfig(modelName, rel);
    if (!relConfig) continue;

    const nestedInclude  = relOpts === true ? null : relOpts.include || null;
    const nestedSelect   = relOpts === true ? null : relOpts.select  || null;
    const nestedOrderBy  = relOpts === true ? null : relOpts.orderBy || null;
    const nestedTake     = relOpts === true ? null : relOpts.take    || null;

    const { type, table, fk, pk, through, throughFk, throughPk } = relConfig;

    if (type === 'belongsTo') {
      // e.g. surat.pembuat (fk = pembuatId on this model, pk = id on User)
      const ids = [...new Set(arr.map(r => r[fk]).filter(Boolean))];
      if (ids.length === 0) { arr.forEach(r => r[rel] = null); continue; }

      // Selalu fetch semua kolom, lalu filter berdasarkan select
      const relRows = await query(`SELECT * FROM \`${table}\` WHERE \`${pk}\` IN (${ids.map(() => '?').join(',')})`, ids);
      const map = {};
      relRows.forEach(r => {
        let row = serializeRow(r);
        // Terapkan select jika ada
        if (nestedSelect) {
          const selKeys = Object.keys(nestedSelect).filter(k => nestedSelect[k]);
          const filtered = {};
          selKeys.forEach(k => filtered[k] = row[k]);
          row = filtered;
        }
        map[r[pk]] = row;
      });
      arr.forEach(r => r[rel] = r[fk] ? (map[r[fk]] || null) : null);

    } else if (type === 'hasMany') {
      // e.g. suratMasuk.disposisi
      const ids = [...new Set(arr.map(r => r[pk]).filter(Boolean))];
      if (ids.length === 0) { arr.forEach(r => r[rel] = []); continue; }

      let sql = `SELECT * FROM \`${table}\` WHERE \`${fk}\` IN (${ids.map(() => '?').join(',')})`;
      if (nestedOrderBy) sql += ` ${buildOrderBy(nestedOrderBy)}`;
      if (nestedTake)    sql += ` LIMIT ${parseInt(nestedTake)}`;

      let relRows = await query(sql, ids);
      relRows = relRows.map(serializeRow);

      if (nestedInclude) {
        relRows = await resolveIncludes(relRows, nestedInclude, relConfig.model);
      }
      // Terapkan select SETELAH resolve nested includes agar FK tidak hilang
      if (nestedSelect && !nestedInclude) {
        const selKeys = Object.keys(nestedSelect).filter(k => nestedSelect[k]);
        relRows = relRows.map(r => { const o = {}; selKeys.forEach(k => o[k] = r[k]); return o; });
      }

      const map = {};
      ids.forEach(id => map[id] = []);
      relRows.forEach(r => { if (map[r[fk]]) map[r[fk]].push(r); });
      arr.forEach(r => r[rel] = map[r[pk]] || []);

    } else if (type === 'count') {
      // _count: { select: { kehadiran: true } }
      if (relOpts && typeof relOpts === 'object' && relOpts.select) {
        const countObj = {};
        for (const [countRel, enabled] of Object.entries(relOpts.select)) {
          if (!enabled) continue;
          const cfg = getRelationConfig(modelName, countRel);
          if (!cfg) { countObj[countRel] = 0; continue; }
          const ids = arr.map(r => r[cfg.pk]).filter(Boolean);
          if (ids.length === 0) { arr.forEach(r => { if (!r._count) r._count = {}; r._count[countRel] = 0; }); continue; }
          const countRows = await query(
            `SELECT \`${cfg.fk}\` as _id, COUNT(*) as cnt FROM \`${cfg.table}\` WHERE \`${cfg.fk}\` IN (${ids.map(() => '?').join(',')}) GROUP BY \`${cfg.fk}\``,
            ids
          );
          const countMap = {};
          countRows.forEach(r => countMap[r._id] = parseInt(r.cnt));
          arr.forEach(r => { if (!r._count) r._count = {}; r._count[countRel] = countMap[r[cfg.pk]] || 0; });
        }
      }
    }
  }

  return isArr ? arr : arr[0];
}

// ── Relation config ────────────────────────────────────────────────────────
function getRelationConfig(modelName, relName) {
  const configs = {
    suratKeluar: {
      pembuat:          { type: 'belongsTo', table: 'user',            pk: 'id', fk: 'pembuatId',          model: 'user' },
      tataUsaha:        { type: 'belongsTo', table: 'user',            pk: 'id', fk: 'tataUsahaId',        model: 'user' },
      kepala:           { type: 'belongsTo', table: 'user',            pk: 'id', fk: 'kepalaId',           model: 'user' },
      penerimaInternal: { type: 'hasMany',   table: 'penerimainternal', pk: 'id', fk: 'suratId',           model: 'penerimaInternal' },
    },
    suratMasuk: {
      uploader:  { type: 'belongsTo', table: 'user',      pk: 'id', fk: 'uploaderId',   model: 'user' },
      disposisi: { type: 'hasMany',   table: 'disposisi', pk: 'id', fk: 'suratMasukId', model: 'disposisi' },
    },
    disposisi: {
      dibuatOleh: { type: 'belongsTo', table: 'user',      pk: 'id', fk: 'dibuatOlehId', model: 'user' },
      penerima:   { type: 'belongsTo', table: 'user',      pk: 'id', fk: 'penerimaId',   model: 'user' },
      suratMasuk: { type: 'belongsTo', table: 'suratmasuk', pk: 'id', fk: 'suratMasukId', model: 'suratMasuk' },
    },
    penerimaInternal: {
      user:  { type: 'belongsTo', table: 'user',       pk: 'id', fk: 'userId',  model: 'user' },
      surat: { type: 'belongsTo', table: 'suratkeluar', pk: 'id', fk: 'suratId', model: 'suratKeluar' },
    },
    agenda: {
      pembuat:   { type: 'belongsTo', table: 'user',          pk: 'id', fk: 'pembuatId', model: 'user' },
      peserta:   { type: 'hasMany',   table: 'pesertaagenda', pk: 'id', fk: 'agendaId',  model: 'pesertaAgenda' },
      kehadiran: { type: 'hasMany',   table: 'kehadiran',     pk: 'id', fk: 'agendaId',  model: 'kehadiran' },
      _count:    { type: 'count' },
    },
    pesertaAgenda: {
      user:   { type: 'belongsTo', table: 'user',   pk: 'id', fk: 'userId',   model: 'user' },
      agenda: { type: 'belongsTo', table: 'agenda', pk: 'id', fk: 'agendaId', model: 'agenda' },
    },
    kehadiran: {
      user:   { type: 'belongsTo', table: 'user',   pk: 'id', fk: 'userId',   model: 'user' },
      agenda: { type: 'belongsTo', table: 'agenda', pk: 'id', fk: 'agendaId', model: 'agenda' },
    },
    notifikasi: {
      user: { type: 'belongsTo', table: 'user', pk: 'id', fk: 'userId', model: 'user' },
    },
    pushSubscription: {
      user: { type: 'belongsTo', table: 'user', pk: 'id', fk: 'userId', model: 'user' },
    },
  };

  return configs[modelName]?.[relName] || null;
}

// ── Data serializer for INSERT/UPDATE ─────────────────────────────────────
function serializeValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object' && v !== null && 'create' in v) return undefined; // nested create — skip
  return v;
}

// ── Model class factory ────────────────────────────────────────────────────
function createModel(modelName) {
  const table = TABLE_MAP[modelName];
  if (!table) throw new Error(`Unknown model: ${modelName}`);

  return {
    // ── findUnique ────────────────────────────────────────────────────────
    async findUnique({ where, select, include } = {}) {
      const params = [];
      const whereStr = buildWhere(where, params);
      const selStr   = buildSelect(select, table);
      const rows = await query(`SELECT ${selStr} FROM \`${table}\` WHERE ${whereStr} LIMIT 1`, params);
      if (!rows.length) return null;
      let row = serializeRow(rows[0]);
      if (include) row = (await resolveIncludes([row], include, modelName))[0];
      return row;
    },

    // ── findFirst ─────────────────────────────────────────────────────────
    async findFirst({ where, select, include, orderBy } = {}) {
      const params = [];
      const whereStr = buildWhere(where, params);
      const selStr   = buildSelect(select, table);
      const orderStr = buildOrderBy(orderBy);
      const rows = await query(`SELECT ${selStr} FROM \`${table}\` WHERE ${whereStr} ${orderStr} LIMIT 1`, params);
      if (!rows.length) return null;
      let row = serializeRow(rows[0]);
      if (include) row = (await resolveIncludes([row], include, modelName))[0];
      return row;
    },

    // ── findMany ──────────────────────────────────────────────────────────
    async findMany({ where, select, include, orderBy, skip, take } = {}) {
      const params = [];
      const whereStr = buildWhere(where, params);
      const selStr   = buildSelect(select, table);
      const orderStr = buildOrderBy(orderBy);
      let sql = `SELECT ${selStr} FROM \`${table}\` WHERE ${whereStr} ${orderStr}`;
      if (take  !== undefined) sql += ` LIMIT ${parseInt(take)}`;
      if (skip  !== undefined) sql += ` OFFSET ${parseInt(skip)}`;
      let rows = (await query(sql, params)).map(serializeRow);
      if (include) rows = await resolveIncludes(rows, include, modelName);
      return rows;
    },

    // ── count ─────────────────────────────────────────────────────────────
    async count({ where } = {}) {
      const params = [];
      const whereStr = buildWhere(where, params);
      const rows = await query(`SELECT COUNT(*) as cnt FROM \`${table}\` WHERE ${whereStr}`, params);
      return parseInt(rows[0].cnt);
    },

    // ── create ────────────────────────────────────────────────────────────
    async create({ data, select, include } = {}) {
      const id = data.id || uuidv4();
      const now = new Date();

      // Auto-generate UUID untuk kolom yang punya @default(uuid()) di schema
      const UUID_DEFAULT_COLS = {
        agenda:      ['qrToken'],
        suratKeluar: [], // qrCodeToken di-generate manual saat TTD
      };
      const uuidCols = UUID_DEFAULT_COLS[modelName] || [];

      // Filter out nested create/relation fields
      const flat = { id, ...data };
      // Auto-fill kolom UUID yang tidak disuplai
      for (const col of uuidCols) {
        if (!flat[col]) flat[col] = uuidv4();
      }
      if (!flat.createdAt) flat.createdAt = now;
      if (HAS_UPDATED_AT.has(table)) flat.updatedAt = now;

      const cols = [];
      const vals = [];
      for (const [k, v] of Object.entries(flat)) {
        const sv = serializeValue(v);
        if (sv === undefined) continue; // skip nested
        cols.push(`\`${k}\``);
        vals.push(sv);
      }

      await query(`INSERT INTO \`${table}\` (${cols.join(',')}) VALUES (${vals.map(() => '?').join(',')})`, vals);

      // Fetch back
      return await this.findUnique({ where: { id }, select, include });
    },

    // ── createMany ────────────────────────────────────────────────────────
    async createMany({ data, skipDuplicates } = {}) {
      if (!data || data.length === 0) return { count: 0 };
      let count = 0;
      for (const item of data) {
        try {
          await this.create({ data: item });
          count++;
        } catch (e) {
          if (!skipDuplicates) throw e;
        }
      }
      return { count };
    },

    // ── update ────────────────────────────────────────────────────────────
    async update({ where, data, select, include } = {}) {
      const now = new Date();
      const flat = { ...data };
      if (HAS_UPDATED_AT.has(table)) flat.updatedAt = now;

      const setCols = [];
      const setVals = [];
      for (const [k, v] of Object.entries(flat)) {
        const sv = serializeValue(v);
        if (sv === undefined) continue;
        setCols.push(`\`${k}\` = ?`);
        setVals.push(sv);
      }
      if (!setCols.length) return await this.findUnique({ where, select, include });

      const whereParams = [];
      const whereStr = buildWhere(where, whereParams);
      await query(`UPDATE \`${table}\` SET ${setCols.join(', ')} WHERE ${whereStr}`, [...setVals, ...whereParams]);

      return await this.findUnique({ where, select, include });
    },

    // ── updateMany ────────────────────────────────────────────────────────
    async updateMany({ where, data } = {}) {
      const now = new Date();
      const flat = { ...data };
      if (HAS_UPDATED_AT.has(table)) flat.updatedAt = now;

      const setCols = [];
      const setVals = [];
      for (const [k, v] of Object.entries(flat)) {
        const sv = serializeValue(v);
        if (sv === undefined) continue;
        setCols.push(`\`${k}\` = ?`);
        setVals.push(sv);
      }
      if (!setCols.length) return { count: 0 };

      const whereParams = [];
      const whereStr = buildWhere(where, whereParams);
      const [result] = await getPool().execute(
        `UPDATE \`${table}\` SET ${setCols.join(', ')} WHERE ${whereStr}`,
        [...setVals, ...whereParams]
      );
      return { count: result.affectedRows };
    },

    // ── upsert ────────────────────────────────────────────────────────────
    async upsert({ where, create: createData, update: updateData, select, include } = {}) {
      const existing = await this.findUnique({ where });
      if (existing) {
        return await this.update({ where, data: updateData, select, include });
      } else {
        return await this.create({ data: createData, select, include });
      }
    },

    // ── delete ────────────────────────────────────────────────────────────
    async delete({ where, select } = {}) {
      const row = await this.findUnique({ where, select });
      const params = [];
      const whereStr = buildWhere(where, params);
      await query(`DELETE FROM \`${table}\` WHERE ${whereStr}`, params);
      return row;
    },

    // ── deleteMany ────────────────────────────────────────────────────────
    async deleteMany({ where } = {}) {
      const params = [];
      const whereStr = buildWhere(where, params);
      const [result] = await getPool().execute(`DELETE FROM \`${table}\` WHERE ${whereStr}`, params);
      return { count: result.affectedRows };
    },
  };
}

// ── Main client ────────────────────────────────────────────────────────────
const prisma = {
  user:             createModel('user'),
  suratKeluar:      createModel('suratKeluar'),
  suratMasuk:       createModel('suratMasuk'),
  organisasiProfil: createModel('organisasiProfil'),
  disposisi:        createModel('disposisi'),
  notifikasi:       createModel('notifikasi'),
  agenda:           createModel('agenda'),
  kehadiran:        createModel('kehadiran'),
  pesertaAgenda:    createModel('pesertaAgenda'),
  penerimaInternal: createModel('penerimaInternal'),
  pushSubscription: createModel('pushSubscription'),
  templateSurat:    createModel('templateSurat'),

  // Raw query (dipakai di debug endpoint)
  async $queryRaw(strings, ...values) {
    const sql = Array.isArray(strings) ? strings.join('?') : String(strings);
    const rows = await query(sql, values);
    return rows;
  },

  async $executeRaw(strings, ...values) {
    const sql = Array.isArray(strings) ? strings.join('?') : String(strings);
    const [result] = await getPool().execute(sql, values);
    return result.affectedRows;
  },

  async $disconnect() {
    if (pool) { await pool.end(); pool = null; }
  },
};

module.exports = prisma;
