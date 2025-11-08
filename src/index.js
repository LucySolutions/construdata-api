require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const admin = require('firebase-admin');
const { createCrudRouter } = require('./crudFactory');
const { buildInsertQuery } = require('./utils');
const db = require('./db');
//const telegramBridge = require('./whatsappBridge');

// Inicializar Firebase Admin SDK
function normalizePrivateKey(key) {
  if (!key) return key;
  let k = key;
  // Si viene entrecomillada, quita comillas envolventes
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  // Normaliza saltos de línea escapados y CRLF
  k = k
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');
  // Si parece base64 (no contiene el encabezado PEM), intenta decodificar
  if (!k.includes('BEGIN PRIVATE KEY') && /^[A-Za-z0-9+/=\s]+$/.test(k.trim())) {
    try {
      const decoded = Buffer.from(k.trim(), 'base64').toString('utf8');
      if (decoded.includes('BEGIN PRIVATE KEY')) {
        k = decoded;
      }
    } catch (e) {
      // ignorar si no es base64 válido
    }
  }
  return k;
}

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = normalizePrivateKey(privateKeyRaw);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Firebase Admin no configurado: faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY');
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch (e) {
      console.error('Error inicializando Firebase Admin:', e);
    }
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

//app.use('/webhooks/messaging', telegramBridge);

const tables = [
  { path: '/api/plans', table: 'plans', allowed: ['name', 'max_obras', 'max_residentes', 'price', 'description', 'is_active'] },
  { path: '/api/constructoras', table: 'constructoras', allowed: ['user_id', 'nombre_empresa', 'rfc', 'telefono', 'email', 'direccion', 'plan_id', 'subscription_status', 'subscription_start_date', 'subscription_end_date', 'monto_minimo', 'monto_maximo', 'is_active'] },
  { path: '/api/obras', table: 'obras', allowed: ['constructora_id', 'nombre', 'direccion', 'descripcion', 'fecha_inicio', 'fecha_fin_estimada', 'fecha_fin_real', 'presupuesto', 'is_active', 'fecha_baja', 'motivo_baja'] },
  { path: '/api/residentes', table: 'residentes', allowed: ['user_id', 'constructora_id', 'telefono', 'nombre', 'apellidos', 'email', 'is_active', 'fecha_baja', 'motivo_baja'] },
  { path: '/api/historial_telefonos', table: 'historial_telefonos', allowed: ['residente_id', 'telefono_anterior', 'telefono_nuevo', 'motivo', 'cambiado_por'] },
  { path: '/api/asignaciones_obra', table: 'asignaciones_obra', allowed: ['residente_id', 'obra_id', 'fecha_inicio', 'fecha_fin', 'is_active', 'motivo_cambio'] },
  { path: '/api/configuracion_reportes', table: 'configuracion_reportes', allowed: ['residente_id', 'dias_envio', 'hora_envio', 'correos_destino', 'mensaje_cuerpo', 'is_active'], columnTypes: { dias_envio: 'int[]', correos_destino: 'text[]' } },
  { path: '/api/reportes', table: 'reportes', allowed: ['obra_id', 'residente_id', 'asignacion_id', 'fecha', 'descripcion_actividades', 'personal_asistente', 'maquinaria_utilizada', 'materiales_utilizados', 'incidencias', 'avance_porcentaje', 'clima', 'fotos_urls', 'enviado', 'fecha_envio', 'whatsapp_message_id', 'telefono_origen', 'mensaje_original', 'procesado_por_ia'], columnTypes: { fotos_urls: 'text[]' } },
  { path: '/api/pagos', table: 'pagos', allowed: ['constructora_id', 'plan_id', 'monto', 'concepto', 'metodo_pago', 'referencia_pago', 'status', 'fecha_pago', 'periodo_inicio', 'periodo_fin'] },
  { path: '/api/user_roles', table: 'user_roles', allowed: ['user_id', 'role', 'constructora_id'] },
  { path: '/api/mensajes_whatsapp_log', table: 'mensajes_whatsapp_log', allowed: ['residente_id', 'telefono', 'mensaje', 'tipo', 'whatsapp_message_id', 'metadata', 'procesado', 'error'], columnTypes: { metadata: 'jsonb' } },
  { path: '/api/gastos-obra', table: 'gastos_obra', allowed: ['obra_id', 'residente_id', 'fecha', 'categoria', 'subcategoria', 'descripcion', 'cantidad', 'unidad', 'precio_unitario', 'monto_total', 'proveedor', 'factura_numero', 'factura_url', 'metodo_pago', 'comprobante_urls', 'notas', 'aprobado', 'aprobado_por', 'fecha_aprobacion', 'incluir_en_reporte', 'whatsapp_message_id', 'enviado_por_whatsapp'], columnTypes: { comprobante_urls: 'text[]' } }
];

for (const t of tables) {
  app.use(
    t.path,
    createCrudRouter({
      table: t.table,
      idColumn: 'id',
      allowedColumns: t.allowed,
      listOrder: 'created_at DESC',
      hasUpdatedAt: true,
      columnTypes: t.columnTypes || {},
    })
  );
}

// Helper: normaliza teléfono a formato E.164 simple (+52##########)
function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return undefined;
  let p = phone.trim();
  // quitar espacios y guiones comunes
  p = p.replace(/[\s-]/g, '');
  // si ya tiene + al inicio, usarlo
  if (p.startsWith('+')) return p;
  // si empieza con 52 y tiene 12-13 dígitos, anteponer +
  if (p.startsWith('52')) return `+${p}`;
  // si es un número mexicano de 10 dígitos, anteponer +52
  if (/^\d{10}$/.test(p)) return `+52${p}`;
  // fallback: devolver sin cambios, Firebase validará
  return p;
}

// Genera una contraseña segura si no se provee
function generateStrongPassword(length = 12) {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()-_=+[]{};:,.<>?';
  const all = lower + upper + numbers + special;
  let pwd = '';
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += numbers[Math.floor(Math.random() * numbers.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = pwd.length; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd;
}

// Middleware de autenticación para verificar tokens Firebase
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }

    const token = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verificando token:', error);
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// --- Endpoint de registro de usuario ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, userType, userData } = req.body;

    if (!email || !password || !userType) {
      return res.status(400).json({ 
        error: 'Email, password y userType son requeridos' 
      });
    }

    // Construir datos para Firebase
    const createData = {
      email,
      password,
      emailVerified: false,
      disabled: false,
    };
    if (userType === 'residente' && userData) {
      const phone = normalizePhoneNumber(userData.telefono);
      if (phone) createData.phoneNumber = phone;
      const displayName = [userData.nombre, userData.apellidos].filter(Boolean).join(' ').trim();
      if (displayName) createData.displayName = displayName;
    } else if (userType === 'constructora' && userData) {
      const phone = normalizePhoneNumber(userData.telefono);
      if (phone) createData.phoneNumber = phone;
      const displayName = (userData.nombre_empresa || '').trim();
      if (displayName) createData.displayName = displayName;
    }

    // Crear usuario en Firebase con fallback si el teléfono es inválido
    let userRecord;
    try {
      userRecord = await admin.auth().createUser(createData);
    } catch (e) {
      if (e?.errorInfo?.code === 'auth/invalid-phone-number' || e?.errorInfo?.code === 'auth/phone-number-already-exists') {
        // Reintentar sin phoneNumber
        const { phoneNumber, ...withoutPhone } = createData;
        userRecord = await admin.auth().createUser(withoutPhone);
      } else {
        throw e;
      }
    }

    // Crear usuario en Supabase (tabla users)
    const { rows: [newUser] } = await db.query(
      'INSERT INTO users (firebase_uid, email, user_type) VALUES ($1, $2, $3) RETURNING id, firebase_uid, email, user_type',
      [userRecord.uid, email, userType]
    );

    // Crear registro específico según el tipo de usuario
    if (userType === 'constructora' && userData) {
      const { text, values } = buildInsertQuery(
        'constructoras',
        { ...userData, user_id: newUser.id },
        ['user_id', 'nombre_empresa', 'rfc', 'telefono', 'email', 'direccion', 'plan_id'],
        {}
      );
      const { rows: [newConstructora] } = await db.query(text, values);
    } else if (userType === 'residente' && userData) {
      const { text, values } = buildInsertQuery(
        'residentes',
        { ...userData, user_id: newUser.id },
        ['user_id', 'constructora_id', 'telefono', 'nombre', 'apellidos', 'email', 'is_active'],
        {}
      );
      const { rows: [newResidente] } = await db.query(text, values);
    }

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: newUser,
      firebaseUid: userRecord.uid
    });

  } catch (error) {
    console.error('Error en registro:', error);
    
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    
    res.status(500).json({ 
      error: 'Error registrando usuario', 
      detail: error.message 
    });
  }
});

// --- Endpoint de login de usuario ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email y password son requeridos' 
      });
    }

    // Para verificar credenciales, necesitamos usar Firebase Auth REST API
    // ya que el Admin SDK no tiene método directo para verificar password
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    if (!firebaseApiKey) {
      throw new Error('FIREBASE_API_KEY no configurada');
    }

    // Verificar credenciales con Firebase Auth REST API
    const signInResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      }
    );

    const signInData = await signInResponse.json();

    if (!signInResponse.ok) {
      if (signInData.error?.message?.includes('INVALID_LOGIN_CREDENTIALS')) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      throw new Error(signInData.error?.message || 'Error en autenticación');
    }

    // Obtener información del usuario desde Firebase Admin SDK
    const userRecord = await admin.auth().getUser(signInData.localId);
    
    // Generar token personalizado para uso interno
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    // Obtener información del usuario desde Supabase
    const { rows: [userInfo] } = await db.query(
      'SELECT id, firebase_uid, email, user_type FROM users WHERE firebase_uid = $1',
      [userRecord.uid]
    );

    res.json({
      message: 'Login exitoso',
      token: customToken,
      idToken: signInData.idToken, // Token de Firebase para el frontend
      refreshToken: signInData.refreshToken,
      user: userInfo || { firebase_uid: userRecord.uid, email: userRecord.email }
    });

  } catch (error) {
    console.error('Error en login:', error);
    
    if (error.message.includes('Credenciales inválidas')) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.status(500).json({ 
      error: 'Error en el proceso de login', 
      detail: error.message 
    });
  }
});

// --- Auth Sync: vincula usuario de Firebase con auth.users (Supabase) ---
app.post('/api/auth/sync', async (req, res) => {
  try {
    const { firebase_uid } = req.body || {};
    if (!firebase_uid || typeof firebase_uid !== 'string') {
      return res.status(400).json({ error: 'firebase_uid requerido' });
    }

    // Buscar existente por firebase_uid en tabla local 'users'
    const existing = await db.query('SELECT id FROM users WHERE firebase_uid = $1', [firebase_uid]);
    if (existing.rowCount > 0) {
      return res.json({ user_id: existing.rows[0].id });
    }

    // Obtener datos del usuario desde Firebase para cumplir NOT NULL de email
    let email = null;
    let full_name = null;
    let phone = null;
    try {
      const u = await admin.auth().getUser(firebase_uid);
      email = u.email || null;
      full_name = u.displayName || null;
      phone = u.phoneNumber || null;
    } catch (e) {
      // Si no se puede obtener el usuario, generar un email sintético basado en el UID
      email = `user-${firebase_uid}@firebase.local`;
    }

    // Crear nuevo registro en 'users' y devolver UUID
    const created = await db.query(
      'INSERT INTO users (firebase_uid, email, full_name, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      [firebase_uid, email, full_name, phone]
    );
    return res.status(201).json({ user_id: created.rows[0].id });
  } catch (e) {
    return res.status(500).json({ error: 'Error sincronizando usuario', detail: e.message });
  }
});

app.post('/api/constructoras/register', async (req, res) => {
  const { email, password, ...constructoraData } = req.body;

  try {
    // Crear usuario en Firebase incluyendo teléfono y displayName si se proveen
    const createData = {
      email,
      password,
    };
    const cPhone = normalizePhoneNumber(constructoraData.telefono);
    if (cPhone) createData.phoneNumber = cPhone;
    if (constructoraData.nombre_empresa) createData.displayName = constructoraData.nombre_empresa;

    let userRecord;
    try {
      userRecord = await admin.auth().createUser(createData);
    } catch (e) {
      if (e?.errorInfo?.code === 'auth/invalid-phone-number' || e?.errorInfo?.code === 'auth/phone-number-already-exists') {
        const { phoneNumber, ...withoutPhone } = createData;
        userRecord = await admin.auth().createUser(withoutPhone);
      } else {
        throw e;
      }
    }

    // Crear usuario en tabla local 'users' con datos mínimos requeridos
    const userEmail = userRecord.email || email;
    const userName = userRecord.displayName || constructoraData.nombre_empresa || null;
    const userPhone = userRecord.phoneNumber || cPhone || null;
    const { rows: [newUser] } = await db.query(
      'INSERT INTO users (firebase_uid, email, full_name, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      [userRecord.uid, userEmail, userName, userPhone]
    );

    // Crear constructora y asociarla al usuario
    const { text, values } = buildInsertQuery(
      'constructoras',
      { ...constructoraData, user_id: newUser.id },
      ['user_id', 'nombre_empresa', 'rfc', 'telefono', 'email', 'direccion', 'plan_id'],
      {}
    );
    const { rows: [newConstructora] } = await db.query(text, values);

    res.status(201).json(newConstructora);
  } catch (error) {
    console.error('Error registrando constructora:', error);
    res.status(500).json({ error: 'Error registrando constructora', detail: error.message });
  }
});

app.post('/api/residentes/register', async (req, res) => {
  const { email, password, ...residenteData } = req.body;

  try {
    // Crear usuario en Firebase con email, displayName y teléfono
    const finalPassword = (typeof password === 'string' && password.trim().length >= 6) ? password.trim() : generateStrongPassword(12);
    const createData = {
      email,
      password: finalPassword,
    };
    const rPhone = normalizePhoneNumber(residenteData.telefono);
    if (rPhone) createData.phoneNumber = rPhone;
    const displayName = [residenteData.nombre, residenteData.apellidos].filter(Boolean).join(' ').trim();
    if (displayName) createData.displayName = displayName;

    let userRecord;
    try {
      userRecord = await admin.auth().createUser(createData);
    } catch (e) {
      if (e?.errorInfo?.code === 'auth/invalid-phone-number' || e?.errorInfo?.code === 'auth/phone-number-already-exists') {
        const { phoneNumber, ...withoutPhone } = createData;
        userRecord = await admin.auth().createUser(withoutPhone);
      } else {
        throw e;
      }
    }

    // Crear usuario en tabla local 'users' con datos mínimos requeridos
    const userEmail = userRecord.email || email || `user-${userRecord.uid}@firebase.local`;
    const userName = userRecord.displayName || displayName || null;
    const userPhone = userRecord.phoneNumber || rPhone || null;
    const { rows: [newUser] } = await db.query(
      'INSERT INTO users (firebase_uid, email, full_name, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      [userRecord.uid, userEmail, userName, userPhone]
    );

    // Si ya existe residente por teléfono, actualizar y vincular user_id en lugar de insertar duplicado
    const telefonoRaw = residenteData.telefono;
    const { rows: existingResidentes } = await db.query('SELECT * FROM residentes WHERE telefono = $1', [telefonoRaw]);
    if (existingResidentes.length > 0) {
      const existing = existingResidentes[0];
      // Actualiza campos principales y asegura vínculo user_id
      const updatePayload = {
        user_id: existing.user_id || newUser.id,
        constructora_id: residenteData.constructora_id || existing.constructora_id,
        telefono: telefonoRaw,
        nombre: residenteData.nombre || existing.nombre,
        apellidos: residenteData.apellidos || existing.apellidos,
        email: residenteData.email || existing.email,
        is_active: typeof residenteData.is_active === 'boolean' ? residenteData.is_active : existing.is_active,
      };
      const sets = [];
      const valuesUpd = [];
      let idx = 1;
      for (const [k, v] of Object.entries(updatePayload)) {
        sets.push(`${k} = $${idx++}`);
        valuesUpd.push(v);
      }
      valuesUpd.push(existing.id);
      const updateSql = `UPDATE residentes SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`;
      const { rows: [updated] } = await db.query(updateSql, valuesUpd);

      // Si se provee obra_id, realizar asignación (cerrar activas previas y crear nueva)
      if (residenteData.obra_id) {
        try {
          await db.query('UPDATE asignaciones_obra SET is_active = false, fecha_fin = NOW() WHERE residente_id = $1 AND is_active = true', [updated.id]);
          const { text: insertAssignText, values: insertAssignValues } = buildInsertQuery(
            'asignaciones_obra',
            { residente_id: updated.id, obra_id: residenteData.obra_id, is_active: true },
            ['residente_id', 'obra_id', 'fecha_inicio', 'fecha_fin', 'is_active', 'motivo_cambio'],
            {}
          );
          await db.query(insertAssignText, insertAssignValues);
        } catch (assignErr) {
          console.error('Error creando asignación de obra:', assignErr);
        }
      }

      return res.status(200).json(updated);
    } else {
      // Crear residente nuevo y asociarlo al usuario
      const { text, values } = buildInsertQuery(
        'residentes',
        { ...residenteData, user_id: newUser.id },
        ['user_id', 'constructora_id', 'telefono', 'nombre', 'apellidos', 'email', 'is_active'],
        {}
      );
      const { rows: [newResidente] } = await db.query(text, values);

      // Si se provee obra_id, realizar asignación inicial
      if (residenteData.obra_id) {
        try {
          // No debería haber asignación activa previa en un alta, pero cerramos por seguridad
          await db.query('UPDATE asignaciones_obra SET is_active = false, fecha_fin = NOW() WHERE residente_id = $1 AND is_active = true', [newResidente.id]);
          const { text: insertAssignText, values: insertAssignValues } = buildInsertQuery(
            'asignaciones_obra',
            { residente_id: newResidente.id, obra_id: residenteData.obra_id, is_active: true },
            ['residente_id', 'obra_id', 'fecha_inicio', 'fecha_fin', 'is_active', 'motivo_cambio'],
            {}
          );
          await db.query(insertAssignText, insertAssignValues);
        } catch (assignErr) {
          console.error('Error creando asignación de obra:', assignErr);
        }
      }

      return res.status(201).json(newResidente);
    }
  } catch (error) {
    console.error('Error registrando residente:', error);
    res.status(500).json({ error: 'Error registrando residente', detail: error.message });
  }
});

// --- Helper: obtener constructora por user_id (UUID de auth.users) ---
app.get('/api/constructoras/by-user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await db.query('SELECT * FROM constructoras WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Constructora no encontrada' });
    return res.json(result.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Error consultando constructora', detail: e.message });
  }
});

// --- Helper: obtener obra activa por residente_id ---
app.get('/api/obras/by-residente/:residenteId', async (req, res) => {
  try {
    const { residenteId } = req.params;
    const result = await db.query(`
      SELECT o.* FROM obras o
      JOIN asignaciones_obra ao ON o.id = ao.obra_id
      WHERE ao.residente_id = $1 AND ao.is_active = true
      ORDER BY ao.fecha_inicio DESC
      LIMIT 1
    `, [residenteId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Obra no encontrada para el residente' });
    return res.json(result.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Error consultando obra por residente', detail: e.message });
  }
});

app.use((err, req, res, next) => {
  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'Conflicto: registro duplicado', detail: err.detail });
  }
  res.status(400).json({ error: err.message || 'Error inesperado' });
});

app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});