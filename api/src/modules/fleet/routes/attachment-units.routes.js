import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'fleet.attachment_units',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.attachment_units);
  },
};
