import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'workforce.skill_claims',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.skill_claims);
  },
};
