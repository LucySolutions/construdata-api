-- =============================================
-- EXTENSIONES REQUERIDAS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =============================================
-- TABLA: users
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firebase_uid TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: plans
-- =============================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,
  max_obras INT NOT NULL,
  max_residentes INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: constructoras
-- =============================================
CREATE TABLE IF NOT EXISTS constructoras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  nombre_empresa VARCHAR(200) NOT NULL,
  rfc VARCHAR(13),
  telefono VARCHAR(20),
  email VARCHAR(255) NOT NULL UNIQUE,
  direccion TEXT,
  plan_id UUID REFERENCES plans(id),
  subscription_status VARCHAR(20) DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
  subscription_start_date TIMESTAMP WITH TIME ZONE,
  subscription_end_date TIMESTAMP WITH TIME ZONE,
  monto_minimo DECIMAL(15,2),
  monto_maximo DECIMAL(15,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: residentes
-- =============================================
CREATE TABLE IF NOT EXISTS residentes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  constructora_id UUID REFERENCES constructoras(id) ON DELETE CASCADE,
  telefono VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  apellidos VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  is_active BOOLEAN DEFAULT true,
  fecha_baja TIMESTAMP WITH TIME ZONE,
  motivo_baja TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: obras
-- =============================================
CREATE TABLE IF NOT EXISTS obras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  constructora_id UUID REFERENCES constructoras(id) ON DELETE CASCADE,
  nombre VARCHAR(200) NOT NULL,
  direccion TEXT,
  descripcion TEXT,
  fecha_inicio DATE,
  fecha_fin_estimada DATE,
  fecha_fin_real DATE,
  presupuesto DECIMAL(15,2),
  is_active BOOLEAN DEFAULT true,
  fecha_baja TIMESTAMP WITH TIME ZONE,
  motivo_baja TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: asignaciones_obra
-- =============================================
CREATE TABLE IF NOT EXISTS asignaciones_obra (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  residente_id UUID REFERENCES residentes(id) ON DELETE CASCADE,
  obra_id UUID REFERENCES obras(id) ON DELETE CASCADE,
  fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fecha_fin TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  motivo_cambio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unica_asignacion_activa_por_residente
    EXCLUDE USING gist (residente_id WITH =) WHERE (is_active = true)
);

-- =============================================
-- TABLA: gastos_obra
-- =============================================
CREATE TABLE IF NOT EXISTS gastos_obra (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  obra_id UUID REFERENCES obras(id) ON DELETE CASCADE NOT NULL,
  residente_id UUID REFERENCES residentes(id) ON DELETE CASCADE NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria VARCHAR(50) NOT NULL CHECK (categoria IN (
    'materiales', 'mano_obra', 'maquinaria', 'combustible', 'herramientas', 'transporte', 'servicios', 'otros'
  )),
  subcategoria VARCHAR(100),
  descripcion TEXT NOT NULL,
  cantidad DECIMAL(10,2),
  unidad VARCHAR(20),
  precio_unitario DECIMAL(10,2),
  monto_total DECIMAL(10,2) NOT NULL,
  proveedor VARCHAR(200),
  factura_numero VARCHAR(100),
  factura_url TEXT,
  metodo_pago VARCHAR(50) CHECK (metodo_pago IN (
    'efectivo', 'transferencia', 'tarjeta', 'cheque', 'vale'
  )),
  comprobante_urls TEXT[],
  notas TEXT,
  aprobado BOOLEAN DEFAULT false,
  aprobado_por UUID REFERENCES users(id),
  fecha_aprobacion TIMESTAMP WITH TIME ZONE,
  incluir_en_reporte BOOLEAN DEFAULT true,
  whatsapp_message_id VARCHAR(100),
  enviado_por_whatsapp BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: reportes
-- =============================================
CREATE TABLE IF NOT EXISTS reportes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  obra_id UUID REFERENCES obras(id) ON DELETE CASCADE,
  residente_id UUID REFERENCES residentes(id) ON DELETE CASCADE,
  asignacion_id UUID REFERENCES asignaciones_obra(id) ON DELETE SET NULL,
  fecha DATE NOT NULL,
  descripcion_actividades TEXT NOT NULL,
  personal_asistente INT,
  maquinaria_utilizada TEXT,
  materiales_utilizados TEXT,
  incidencias TEXT,
  avance_porcentaje DECIMAL(5,2),
  clima VARCHAR(50),
  fotos_urls TEXT[],
  enviado BOOLEAN DEFAULT false,
  fecha_envio TIMESTAMP WITH TIME ZONE,
  whatsapp_message_id VARCHAR(100),
  telefono_origen VARCHAR(20),
  mensaje_original TEXT,
  procesado_por_ia BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: pagos
-- =============================================
CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  constructora_id UUID REFERENCES constructoras(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id),
  monto DECIMAL(10,2) NOT NULL,
  concepto VARCHAR(200) NOT NULL,
  metodo_pago VARCHAR(50),
  referencia_pago VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  fecha_pago TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  periodo_inicio DATE,
  periodo_fin DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: user_roles
-- =============================================
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'residente')),
  constructora_id UUID REFERENCES constructoras(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, constructora_id)
);

-- =============================================
-- TABLA: mensajes_whatsapp_log
-- =============================================
CREATE TABLE IF NOT EXISTS mensajes_whatsapp_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  residente_id UUID REFERENCES residentes(id) ON DELETE SET NULL,
  telefono VARCHAR(20) NOT NULL,
  mensaje TEXT NOT NULL,
  tipo VARCHAR(20) CHECK (tipo IN ('texto', 'imagen', 'video', 'audio', 'documento')),
  whatsapp_message_id VARCHAR(100),
  metadata JSONB,
  procesado BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: historial_telefonos
-- =============================================
CREATE TABLE IF NOT EXISTS historial_telefonos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  residente_id UUID REFERENCES residentes(id) ON DELETE CASCADE,
  telefono_anterior VARCHAR(20) NOT NULL,
  telefono_nuevo VARCHAR(20) NOT NULL,
  fecha_cambio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  motivo VARCHAR(200),
  cambiado_por UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: configuracion_reportes
-- =============================================
CREATE TABLE IF NOT EXISTS configuracion_reportes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  residente_id UUID REFERENCES residentes(id) ON DELETE CASCADE UNIQUE,
  dias_envio INT[] DEFAULT '{1,2,3,4,5}',
  hora_envio TIME DEFAULT '18:00:00',
  correos_destino TEXT[] NOT NULL DEFAULT '{}',
  mensaje_cuerpo TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


ALTER TABLE users
ADD COLUMN telegram_id BIGINT UNIQUE;