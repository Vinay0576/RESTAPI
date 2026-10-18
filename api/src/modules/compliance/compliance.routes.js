import {createComplianceController} from './compliance.controller.js';
import documentsRoutes from './routes/documents.routes.js';
import documentReviewsRoutes from './routes/document-reviews.routes.js';
import licenceCategoriesRoutes from './routes/licence-categories.routes.js';
import identityCasesRoutes from './routes/identity-cases.routes.js';

export default {
  domain: 'compliance',
  createController: createComplianceController,
  routes: [
    documentsRoutes,
    documentReviewsRoutes,
    licenceCategoriesRoutes,
    identityCasesRoutes,
  ],
};
