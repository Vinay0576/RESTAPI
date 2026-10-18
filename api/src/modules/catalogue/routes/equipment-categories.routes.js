import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'catalogue.equipment_categories',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.equipment_categories);
  },
};
