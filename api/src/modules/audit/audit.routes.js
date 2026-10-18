import {createAuditController} from './audit.controller.js';
import eventsRoutes from './routes/events.routes.js';

export default {
  domain: 'audit',
  createController: createAuditController,
  routes: [
    eventsRoutes,
  ],
};
