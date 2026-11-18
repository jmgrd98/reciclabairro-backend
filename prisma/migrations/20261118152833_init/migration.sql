-- PostGIS: necessário para a coluna geography e as buscas por proximidade.
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MORADOR', 'COMERCIANTE', 'GESTOR_COOPERATIVA', 'COLETOR', 'EDUCADOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('SOLICITADA', 'EM_ANALISE', 'AGENDADA', 'EM_ROTA', 'CONCLUIDA', 'CANCELADA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "Period" AS ENUM ('MANHA', 'TARDE', 'NOITE');

-- CreateEnum
CREATE TYPE "QuantityUnit" AS ENUM ('SACOS', 'KG', 'CAIXAS', 'UNIDADES');

-- CreateEnum
CREATE TYPE "CollectionPointType" AS ENUM ('ECOPONTO', 'PEV', 'COOPERATIVA', 'COMERCIO');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('GESTOR', 'COLETOR');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDENTE', 'ENVIADA', 'FALHOU');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MORADOR',
    "lgpdConsentAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT,
    "zipCode" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "regionId" UUID,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "neighborhoods" TEXT[],
    "centerLatitude" DOUBLE PRECISION,
    "centerLongitude" DOUBLE PRECISION,
    "radiusKm" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "recyclable" BOOLEAN NOT NULL,
    "preparation" TEXT NOT NULL,
    "notes" TEXT,
    "synonyms" TEXT[],
    "searchText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialGuideView" (
    "id" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "userId" UUID,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialGuideView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPoint" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CollectionPointType" NOT NULL,
    "zipCode" TEXT,
    "street" TEXT NOT NULL,
    "number" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geo" geography(Point, 4326),
    "regionId" UUID,
    "cooperativeId" UUID,
    "instructions" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPointCategory" (
    "collectionPointId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "CollectionPointCategory_pkey" PRIMARY KEY ("collectionPointId","categoryId")
);

-- CreateTable
CREATE TABLE "CollectionPointHours" (
    "id" UUID NOT NULL,
    "collectionPointId" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "opensAt" CHAR(5) NOT NULL,
    "closesAt" CHAR(5) NOT NULL,

    CONSTRAINT "CollectionPointHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionSchedule" (
    "id" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "period" "Period" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cooperative" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cooperative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CooperativeRegion" (
    "cooperativeId" UUID NOT NULL,
    "regionId" UUID NOT NULL,

    CONSTRAINT "CooperativeRegion_pkey" PRIMARY KEY ("cooperativeId","regionId")
);

-- CreateTable
CREATE TABLE "CooperativeMember" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MemberRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CooperativeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupRequest" (
    "id" UUID NOT NULL,
    "sequence" SERIAL NOT NULL,
    "protocol" TEXT,
    "requesterId" UUID NOT NULL,
    "addressId" UUID,
    "addressText" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "regionId" UUID NOT NULL,
    "cooperativeId" UUID,
    "collectorId" UUID,
    "status" "PickupStatus" NOT NULL DEFAULT 'SOLICITADA',
    "preferredDate" DATE,
    "preferredPeriod" "Period",
    "scheduledDate" DATE,
    "scheduledPeriod" "Period",
    "requesterNotes" TEXT,
    "closingReason" TEXT,
    "completionNotes" TEXT,
    "reviewStartedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupRequestItem" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "QuantityUnit" NOT NULL,

    CONSTRAINT "PickupRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupCollectedItem" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "QuantityUnit" NOT NULL,

    CONSTRAINT "PickupCollectedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupStatusHistory" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "fromStatus" "PickupStatus",
    "toStatus" "PickupStatus" NOT NULL,
    "kind" TEXT NOT NULL,
    "authorId" UUID,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickupStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CollectionScheduleToMaterialCategory" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_CollectionScheduleToMaterialCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Address_regionId_idx" ON "Address"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_city_state_key" ON "Region"("name", "city", "state");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_name_key" ON "MaterialCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_slug_key" ON "MaterialCategory"("slug");

-- CreateIndex
CREATE INDEX "Material_categoryId_idx" ON "Material"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_categoryId_name_key" ON "Material"("categoryId", "name");

-- CreateIndex
CREATE INDEX "MaterialGuideView_materialId_idx" ON "MaterialGuideView"("materialId");

-- CreateIndex
CREATE INDEX "MaterialGuideView_viewedAt_idx" ON "MaterialGuideView"("viewedAt");

-- CreateIndex
CREATE INDEX "CollectionPoint_geo_idx" ON "CollectionPoint" USING GIST ("geo");

-- CreateIndex
CREATE INDEX "CollectionPoint_regionId_idx" ON "CollectionPoint"("regionId");

-- CreateIndex
CREATE INDEX "CollectionPointCategory_categoryId_idx" ON "CollectionPointCategory"("categoryId");

-- CreateIndex
CREATE INDEX "CollectionPointHours_collectionPointId_idx" ON "CollectionPointHours"("collectionPointId");

-- CreateIndex
CREATE INDEX "CollectionSchedule_regionId_idx" ON "CollectionSchedule"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleException_regionId_date_key" ON "ScheduleException"("regionId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Cooperative_cnpj_key" ON "Cooperative"("cnpj");

-- CreateIndex
CREATE INDEX "CooperativeRegion_regionId_idx" ON "CooperativeRegion"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "CooperativeMember_userId_key" ON "CooperativeMember"("userId");

-- CreateIndex
CREATE INDEX "CooperativeMember_cooperativeId_idx" ON "CooperativeMember"("cooperativeId");

-- CreateIndex
CREATE UNIQUE INDEX "PickupRequest_sequence_key" ON "PickupRequest"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PickupRequest_protocol_key" ON "PickupRequest"("protocol");

-- CreateIndex
CREATE INDEX "PickupRequest_requesterId_createdAt_idx" ON "PickupRequest"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "PickupRequest_cooperativeId_status_idx" ON "PickupRequest"("cooperativeId", "status");

-- CreateIndex
CREATE INDEX "PickupRequest_regionId_status_idx" ON "PickupRequest"("regionId", "status");

-- CreateIndex
CREATE INDEX "PickupRequest_collectorId_scheduledDate_idx" ON "PickupRequest"("collectorId", "scheduledDate");

-- CreateIndex
CREATE INDEX "PickupRequestItem_requestId_idx" ON "PickupRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "PickupRequestItem_categoryId_idx" ON "PickupRequestItem"("categoryId");

-- CreateIndex
CREATE INDEX "PickupCollectedItem_requestId_idx" ON "PickupCollectedItem"("requestId");

-- CreateIndex
CREATE INDEX "PickupCollectedItem_categoryId_idx" ON "PickupCollectedItem"("categoryId");

-- CreateIndex
CREATE INDEX "PickupStatusHistory_requestId_createdAt_idx" ON "PickupStatusHistory"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "_CollectionScheduleToMaterialCategory_B_index" ON "_CollectionScheduleToMaterialCategory"("B");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialGuideView" ADD CONSTRAINT "MaterialGuideView_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialGuideView" ADD CONSTRAINT "MaterialGuideView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoint" ADD CONSTRAINT "CollectionPoint_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoint" ADD CONSTRAINT "CollectionPoint_cooperativeId_fkey" FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPointCategory" ADD CONSTRAINT "CollectionPointCategory_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPointCategory" ADD CONSTRAINT "CollectionPointCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPointHours" ADD CONSTRAINT "CollectionPointHours_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionSchedule" ADD CONSTRAINT "CollectionSchedule_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeRegion" ADD CONSTRAINT "CooperativeRegion_cooperativeId_fkey" FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeRegion" ADD CONSTRAINT "CooperativeRegion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeMember" ADD CONSTRAINT "CooperativeMember_cooperativeId_fkey" FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeMember" ADD CONSTRAINT "CooperativeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_cooperativeId_fkey" FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequestItem" ADD CONSTRAINT "PickupRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PickupRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequestItem" ADD CONSTRAINT "PickupRequestItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupCollectedItem" ADD CONSTRAINT "PickupCollectedItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PickupRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupCollectedItem" ADD CONSTRAINT "PickupCollectedItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupStatusHistory" ADD CONSTRAINT "PickupStatusHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PickupRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupStatusHistory" ADD CONSTRAINT "PickupStatusHistory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionScheduleToMaterialCategory" ADD CONSTRAINT "_CollectionScheduleToMaterialCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "CollectionSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionScheduleToMaterialCategory" ADD CONSTRAINT "_CollectionScheduleToMaterialCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "MaterialCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mantém "geo" sincronizada com latitude/longitude.
CREATE OR REPLACE FUNCTION collection_point_set_geo() RETURNS trigger AS $$
BEGIN
  NEW."geo" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collection_point_geo_trigger
BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "CollectionPoint"
FOR EACH ROW EXECUTE FUNCTION collection_point_set_geo();
