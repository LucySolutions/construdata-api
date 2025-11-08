const express = require('express');
const db = require('./db');
const { buildInsertQuery, buildUpdateQuery } = require('./utils');

function createCrudRouter({ table, idColumn = 'id', allowedColumns = [], listOrder = 'created_at DESC', hasUpdatedAt = true, columnTypes = {} }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const result = await db.query(`SELECT * FROM ${table} ORDER BY ${listOrder}`);
      res.json(result.rows);
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const result = await db.query(`SELECT * FROM ${table} WHERE ${idColumn} = $1`, [req.params.id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
      res.json(result.rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { text, values } = buildInsertQuery(table, req.body, allowedColumns, columnTypes);
      const result = await db.query(text, values);
      res.status(201).json(result.rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const { text, values } = buildUpdateQuery(table, idColumn, req.params.id, req.body, allowedColumns, hasUpdatedAt, columnTypes);
      const result = await db.query(text, values);
      if (result.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
      res.json(result.rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await db.query(`DELETE FROM ${table} WHERE ${idColumn} = $1 RETURNING *`, [req.params.id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
      res.json({ deleted: result.rows[0] });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { createCrudRouter };