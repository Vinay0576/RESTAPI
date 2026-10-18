import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'support.damage_details',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.damage_details);
  },
};
