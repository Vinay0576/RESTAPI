import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'workforce.skill_reviews',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.skill_reviews);
  },
};
