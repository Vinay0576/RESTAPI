import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'compliance.licence_categories',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.licence_categories);
  },
};
