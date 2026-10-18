import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.custody_events',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.custody_events);
  },
};
