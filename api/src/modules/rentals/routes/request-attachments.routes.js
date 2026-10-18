import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.request_attachments',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.request_attachments);
  },
};
