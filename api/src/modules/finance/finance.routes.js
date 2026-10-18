import {createFinanceController} from './finance.controller.js';
import currenciesRoutes from './routes/currencies.routes.js';
import policyVersionsRoutes from './routes/policy-versions.routes.js';
import contractsRoutes from './routes/contracts.routes.js';
import contractLinesRoutes from './routes/contract-lines.routes.js';
import invoicesRoutes from './routes/invoices.routes.js';
import obligationsRoutes from './routes/obligations.routes.js';
import paymentAttemptsRoutes from './routes/payment-attempts.routes.js';
import paymentEventsRoutes from './routes/payment-events.routes.js';
import capturesRoutes from './routes/captures.routes.js';
import refundsRoutes from './routes/refunds.routes.js';
import payeeProfilesRoutes from './routes/payee-profiles.routes.js';
import payoutsRoutes from './routes/payouts.routes.js';
import payoutTaxLinesRoutes from './routes/payout-tax-lines.routes.js';
import payoutEventsRoutes from './routes/payout-events.routes.js';
import wageAdjustmentsRoutes from './routes/wage-adjustments.routes.js';
import wageReceiptsRoutes from './routes/wage-receipts.routes.js';
import wageAcknowledgementsRoutes from './routes/wage-acknowledgements.routes.js';
import depositEventsRoutes from './routes/deposit-events.routes.js';
import accessPlanVersionsRoutes from './routes/access-plan-versions.routes.js';
import accessPurchasesRoutes from './routes/access-purchases.routes.js';
import accessEntitlementsRoutes from './routes/access-entitlements.routes.js';
import ledgerAccountsRoutes from './routes/ledger-accounts.routes.js';
import journalsRoutes from './routes/journals.routes.js';
import entriesRoutes from './routes/entries.routes.js';
import bookingBalancesRoutes from './routes/booking-balances.routes.js';

export default {
  domain: 'finance',
  createController: createFinanceController,
  routes: [
    currenciesRoutes,
    policyVersionsRoutes,
    contractsRoutes,
    contractLinesRoutes,
    invoicesRoutes,
    obligationsRoutes,
    paymentAttemptsRoutes,
    paymentEventsRoutes,
    capturesRoutes,
    refundsRoutes,
    payeeProfilesRoutes,
    payoutsRoutes,
    payoutTaxLinesRoutes,
    payoutEventsRoutes,
    wageAdjustmentsRoutes,
    wageReceiptsRoutes,
    wageAcknowledgementsRoutes,
    depositEventsRoutes,
    accessPlanVersionsRoutes,
    accessPurchasesRoutes,
    accessEntitlementsRoutes,
    ledgerAccountsRoutes,
    journalsRoutes,
    entriesRoutes,
  ],
  extraRoutes: [bookingBalancesRoutes],
};
