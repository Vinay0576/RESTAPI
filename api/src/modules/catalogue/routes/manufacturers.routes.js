import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'catalogue.manufacturers',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.manufacturers);
  },
};
