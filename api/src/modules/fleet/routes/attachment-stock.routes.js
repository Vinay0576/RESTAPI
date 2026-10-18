import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'fleet.attachment_stock',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.attachment_stock);
  },
};
