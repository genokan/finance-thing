-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('ESSENTIAL', 'DISCRETIONARY');

-- CreateEnum
CREATE TYPE "IntervalUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "InvestmentType" AS ENUM ('BROKERAGE', 'IRA', 'ROTH_IRA', 'PLAN_401K', 'DEFINED_CONTRIBUTION', 'RSU', 'SAVINGS', 'MONEY_MARKET', 'CHECKING');

-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('SHORT_TERM', 'LONG_TERM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "benchmarkRate" DECIMAL(6,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "intervalUnit" "IntervalUnit" NOT NULL DEFAULT 'MONTH',
    "categoryId" TEXT NOT NULL,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "renewsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeDistribution" (
    "id" TEXT NOT NULL,
    "incomeSourceId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "IncomeDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InvestmentType" NOT NULL,
    "ticker" TEXT,
    "shares" DECIMAL(18,6),
    "vestedShares" DECIMAL(18,6),
    "unvestedShares" DECIMAL(18,6),
    "unvestedValue" DECIMAL(12,2),
    "institutionId" TEXT,
    "currentValue" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DebtType" NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "monthlyPayment" DECIMAL(12,2) NOT NULL,
    "apr" DECIMAL(6,4) NOT NULL,
    "institutionId" TEXT,
    "payoffDate" TIMESTAMP(3),
    "promoApr" DECIMAL(6,4),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlySnapshot" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "netWorth" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "expenseItemId" TEXT NOT NULL,
    "monthlyEquivalent" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ExpenseSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "incomeSourceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "IncomeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "investmentAccountId" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "unvestedValue" DECIMAL(12,2),

    CONSTRAINT "InvestmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "monthlyPayment" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "DebtSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidItem" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_name_key" ON "Institution"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySnapshot_year_month_key" ON "MonthlySnapshot"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidItem_itemId_key" ON "PlaidItem"("itemId");

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeDistribution" ADD CONSTRAINT "IncomeDistribution_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentAccount" ADD CONSTRAINT "InvestmentAccount_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSnapshot" ADD CONSTRAINT "ExpenseSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MonthlySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSnapshot" ADD CONSTRAINT "ExpenseSnapshot_expenseItemId_fkey" FOREIGN KEY ("expenseItemId") REFERENCES "ExpenseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSnapshot" ADD CONSTRAINT "IncomeSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MonthlySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSnapshot" ADD CONSTRAINT "IncomeSnapshot_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentSnapshot" ADD CONSTRAINT "InvestmentSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MonthlySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentSnapshot" ADD CONSTRAINT "InvestmentSnapshot_investmentAccountId_fkey" FOREIGN KEY ("investmentAccountId") REFERENCES "InvestmentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtSnapshot" ADD CONSTRAINT "DebtSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MonthlySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtSnapshot" ADD CONSTRAINT "DebtSnapshot_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
