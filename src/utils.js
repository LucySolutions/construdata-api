function toPgArray(val) {
  if (val == null) return val;
  if (Array.isArray(val)) {
    return `{${val.map((v) => String(v).replace(/"/g, '\\"')).join(',')}}`;
  }
  return val; // assume already in PG array literal
}

function transformValue(value, type) {
  if (!type) return value;
  switch (type) {
    case 'jsonb':
      return value == null ? value : JSON.stringify(value);
    case 'int[]':
    case 'text[]':
      return toPgArray(value);
    default:
      return value;
  }
}

function placeholderWithCast(index, type) {
  const base = `$${index}`;
  return type ? `${base}::${type}` : base;
}

function buildInsertQuery(table, data, allowedColumns, columnTypes = {}) {
  const keys = allowedColumns.filter((k) => data[k] !== undefined);
  if (keys.length === 0) throw new Error('Sin campos para insertar');
  const cols = keys.join(', ');
  const placeholders = keys
    .map((k, i) => placeholderWithCast(i + 1, columnTypes[k]))
    .join(', ');
  const values = keys.map((k) => transformValue(data[k], columnTypes[k]));
  const text = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`;
  return { text, values };
}

function buildUpdateQuery(table, idColumn, id, data, allowedColumns, hasUpdatedAt, columnTypes = {}) {
  const keys = allowedColumns.filter((k) => data[k] !== undefined);
  const setClauses = keys.map((k, i) => `${k} = ${placeholderWithCast(i + 1, columnTypes[k])}`);
  if (hasUpdatedAt) setClauses.push(`updated_at = NOW()`);
  if (setClauses.length === 0) throw new Error('Sin campos para actualizar');
  const text = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${idColumn} = $${keys.length + 1} RETURNING *`;
  const values = keys.map((k) => transformValue(data[k], columnTypes[k]));
  values.push(id);
  return { text, values };
}

module.exports = { buildInsertQuery, buildUpdateQuery };