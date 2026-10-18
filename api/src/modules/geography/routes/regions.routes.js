import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'geography.regions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.regions);
  },
};
