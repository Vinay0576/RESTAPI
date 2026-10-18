import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'catalogue.attachments',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.attachments);
  },
};
