import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'catalogue.attachment_categories',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.attachment_categories);
  },
};
