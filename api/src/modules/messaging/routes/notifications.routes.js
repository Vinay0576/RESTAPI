import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'messaging.notifications',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.notifications);
  },
};
