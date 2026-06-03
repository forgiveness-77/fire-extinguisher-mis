require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const PORT = process.env.PORT || 3002;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:3002').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.options('*', cors());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${new Date().toISOString()}] [${level}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Extinguisher Service API – TZW LTD FEMS',
      version: '1.0.0',
      description: 'Fire extinguisher registration and CRUD operations.\n\n**Types:** `Water` | `CO2` | `Foam` | `DryChemical`\n\n**Statuses:** `active` | `inactive` | `expired` | `maintenance`',
    },
    servers: [{ url: `http://localhost:${PORT}`, description: 'Extinguisher Service' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  apis: ['./src/routes/*.js'],
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'Extinguisher Service – TZW FEMS' }));
app.get('/swagger.json', (req, res) => res.json(swaggerSpec));

app.use('/api/extinguishers', require('./routes/extinguishers'));

app.get('/health', (req, res) =>
  res.json({ service: 'extinguisher-service', status: 'ok', port: PORT, time: new Date().toISOString() })
);

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.stack || err.message}`);
  if (err.message?.startsWith('CORS')) return res.status(403).json({ error: err.message });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () =>
  console.log(`[Extinguisher Service] http://localhost:${PORT} | Docs: http://localhost:${PORT}/api-docs`)
);
