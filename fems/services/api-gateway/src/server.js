require('dotenv').config();
const express = require('express');
const cors = require('cors');
const proxy = require('express-http-proxy');
const swaggerUi = require('swagger-ui-express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const SERVICES = {
  users:          process.env.USER_SERVICE_URL         || 'http://localhost:3001',
  extinguishers:  process.env.EXTINGUISHER_SERVICE_URL || 'http://localhost:3002',
  inspections:    process.env.INSPECTION_SERVICE_URL   || 'http://localhost:3003',
  maintenance:    process.env.INSPECTION_SERVICE_URL   || 'http://localhost:3003',
  reports:        process.env.REPORT_SERVICE_URL       || 'http://localhost:3004',
};

app.use(cors());
app.use(express.json());

// Aggregate Swagger from all services
async function buildAggregatedSwagger() {
  const base = {
    openapi: '3.0.0',
    info: {
      title: 'TZW LTD FEMS - API Gateway',
      version: '1.0.0',
      description: `
## Fire Extinguisher Management System — Microservices API

**Services:**
| Service | Port | Docs |
|---|---|---|
| User Service | 3001 | [Open](http://localhost:3001/api-docs) |
| Extinguisher Service | 3002 | [Open](http://localhost:3002/api-docs) |
| Inspection Service | 3003 | [Open](http://localhost:3003/api-docs) |
| Report Service | 3004 | [Open](http://localhost:3004/api-docs) |

All requests below are proxied to the appropriate microservice.
      `,
    },
    servers: [{ url: `http://localhost:${PORT}`, description: 'API Gateway' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    paths: {},
    tags: [],
  };

  const serviceUrls = [
    SERVICES.users,
    SERVICES.extinguishers,
    SERVICES.inspections,
    SERVICES.reports,
  ];

  for (const url of serviceUrls) {
    try {
      const response = await fetch(`${url}/swagger.json`, { timeout: 3000 });
      if (response.ok) {
        const spec = await response.json();
        Object.assign(base.paths, spec.paths || {});
        if (spec.components?.schemas) {
          base.components.schemas = { ...(base.components.schemas || {}), ...spec.components.schemas };
        }
        if (spec.tags) base.tags.push(...spec.tags);
      }
    } catch {
      // service not yet running — skip
    }
  }

  return base;
}

// Serve aggregated swagger
app.get('/swagger.json', async (req, res) => {
  try {
    res.json(await buildAggregatedSwagger());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', async (req, res, next) => {
  try {
    const spec = await buildAggregatedSwagger();
    const html = swaggerUi.generateHTML(spec, {
      customSiteTitle: 'TZW LTD FEMS - API Docs',
      customCss: `
        .swagger-ui .topbar { background-color: #DC143C; }
        .swagger-ui .topbar-wrapper img { content: url(''); }
        .swagger-ui .topbar-wrapper::before { content: 'TZW LTD - FEMS'; color: white; font-size: 20px; font-weight: bold; }
      `,
    });
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// Proxy routes
app.use('/api/users', proxy(SERVICES.users, {
  proxyReqPathResolver: req => `/api/users${req.url}`,
}));
app.use('/api/extinguishers', proxy(SERVICES.extinguishers, {
  proxyReqPathResolver: req => `/api/extinguishers${req.url}`,
}));
app.use('/api/inspections', proxy(SERVICES.inspections, {
  proxyReqPathResolver: req => `/api/inspections${req.url}`,
}));
app.use('/api/maintenance', proxy(SERVICES.maintenance, {
  proxyReqPathResolver: req => `/api/maintenance${req.url}`,
}));
app.use('/api/reports', proxy(SERVICES.reports, {
  proxyReqPathResolver: req => `/api/reports${req.url}`,
}));

// Health check — pings all services
app.get('/health', async (req, res) => {
  const results = {};
  for (const [name, url] of Object.entries(SERVICES)) {
    if (results[url]) { results[name] = results[url]; continue; }
    try {
      const r = await fetch(`${url}/health`, { timeout: 3000 });
      results[name] = r.ok ? 'ok' : 'degraded';
    } catch {
      results[name] = 'unreachable';
    }
  }
  const allOk = Object.values(results).every(s => s === 'ok');
  res.status(allOk ? 200 : 207).json({ gateway: 'ok', services: results, time: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Gateway error' });
});

app.listen(PORT, () => {
  console.log(`[API Gateway] Running on http://localhost:${PORT}`);
  console.log(`[API Gateway] Swagger UI: http://localhost:${PORT}/api-docs`);
  console.log(`[API Gateway] Health:     http://localhost:${PORT}/health`);
});
