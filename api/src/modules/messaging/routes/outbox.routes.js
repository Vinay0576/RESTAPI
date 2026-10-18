import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'messaging.outbox',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.outbox);
  },
};
