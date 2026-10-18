import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'fleet.included_attachments',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.included_attachments);
  },
};
