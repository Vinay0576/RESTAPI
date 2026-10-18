import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'audit.events',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.events);
  },
};
