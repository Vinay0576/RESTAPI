import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'catalogue.variants',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.variants);
  },
};
