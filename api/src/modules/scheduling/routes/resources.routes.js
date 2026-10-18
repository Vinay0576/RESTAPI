import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'scheduling.resources',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.resources);
  },
};
