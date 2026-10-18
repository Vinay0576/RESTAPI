import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'catalogue.models',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.models);
  },
};
