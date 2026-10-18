import {createMessagingController} from './messaging.controller.js';
import outboxRoutes from './routes/outbox.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import pushDevicesRoutes from './routes/push-devices.routes.js';

export default {
  domain: 'messaging',
  createController: createMessagingController,
  routes: [
    outboxRoutes,
    notificationsRoutes,
    pushDevicesRoutes,
  ],
};
