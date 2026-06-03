require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const swaggerUi  = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app  = express();
const PORT = process.env.PORT || 3001;

const ALLOWED = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
app.use(cors({ origin: (o, cb) => (!o || ALLOWED.includes(o)) ? cb(null, true) : cb(new Error(`CORS: ${o} not allowed`)), methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: true }));
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    const lvl = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${new Date().toISOString()}] [${lvl}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now()-t}ms)`);
  });
  next();
});

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'User Service – TZW LTD FEMS', version: '1.0.0', description: 'Auth, user management, inspector approval, notifications' },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  },
  apis: ['./src/routes/*.js'],
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/swagger.json', (req, res) => res.json(swaggerSpec));

app.use('/api/users',         require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));

app.get('/health', (_, res) => res.json({ service: 'user-service', status: 'ok', port: PORT, time: new Date().toISOString() }));
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.stack || err.message}`);
  if (err.message?.startsWith('CORS')) return res.status(403).json({ error: err.message });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`[User Service] http://localhost:${PORT} | Docs: http://localhost:${PORT}/api-docs`));
