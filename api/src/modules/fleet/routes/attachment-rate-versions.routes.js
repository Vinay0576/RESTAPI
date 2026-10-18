import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'fleet.attachment_rate_versions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.attachment_rate_versions);
  },
};
