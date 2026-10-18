import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'compliance.document_reviews',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.document_reviews);
  },
};
