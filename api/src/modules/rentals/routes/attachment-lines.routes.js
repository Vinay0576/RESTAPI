import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.attachment_lines',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.attachment_lines);
  },
};
