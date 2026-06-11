import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { name: 'Maintenance', code: 'MNT' },
  { name: 'Electrical', code: 'ELE' },
  { name: 'Mechanical', code: 'MEC' },
  { name: 'Instrumentation', code: 'INS' },
  { name: 'Stores', code: 'STR' },
  { name: 'Operations', code: 'OPS' },
  { name: 'IT', code: 'IT' },
  { name: 'Administration', code: 'ADM' },
];

async function main() {
  console.log('Seeding LDPL CMMS database...');

  for (const dept of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: dept,
    });
  }

  const maintenanceDept = await prisma.department.findUnique({ where: { code: 'MNT' } });
  const passwordHash = await bcrypt.hash('Admin@123', 12);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@ldpl.local',
      passwordHash,
      fullName: 'System Administrator',
      employeeId: 'LDPL-001',
      role: UserRole.admin,
      departmentId: maintenanceDept?.id,
      designation: 'IT Administrator',
      isActive: true,
    },
  });

  const demoUsers = [
    {
      username: 'manager',
      fullName: 'Plant Manager',
      role: UserRole.manager,
      employeeId: 'LDPL-002',
      designation: 'General Manager',
    },
    {
      username: 'engineer',
      fullName: 'Maintenance Engineer',
      role: UserRole.engineer,
      employeeId: 'LDPL-003',
      designation: 'Senior Engineer',
    },
    {
      username: 'supervisor',
      fullName: 'Shift Supervisor',
      role: UserRole.supervisor,
      employeeId: 'LDPL-004',
      designation: 'Maintenance Supervisor',
    },
    {
      username: 'storekeeper',
      fullName: 'Store Keeper',
      role: UserRole.storekeeper,
      employeeId: 'LDPL-005',
      designation: 'Stores In-charge',
    },
    {
      username: 'technician',
      fullName: 'Maintenance Technician',
      role: UserRole.technician,
      employeeId: 'LDPL-006',
      designation: 'Technician',
    },
  ];

  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: {},
      create: {
        ...user,
        email: `${user.username}@ldpl.local`,
        passwordHash,
        departmentId: maintenanceDept?.id,
        isActive: true,
        createdById: admin.id,
      },
    });
  }

  await prisma.systemConfig.upsert({
    where: { key: 'app_settings' },
    update: {},
    create: {
      key: 'app_settings',
      value: {
        companyName: 'Liberty Daharki Powers Ltd',
        plantName: '235 MW Power Plant',
        location: 'Daharki, Ghotki, Sindh, Pakistan',
        currency: 'PKR',
        woNumberPrefix: 'WO',
        assetTagPrefix: 'LDPL',
        itemCodePrefix: 'ITM',
        poNumberPrefix: 'PO',
      },
    },
  });

  const mechDept = await prisma.department.findUnique({ where: { code: 'MEC' } });
  const engineer = await prisma.user.findUnique({ where: { username: 'engineer' } });

  const existingPlant = await prisma.asset.findUnique({ where: { assetTagNo: 'LDPL-00001' } });
  if (!existingPlant) {
    const plant = await prisma.asset.create({
      data: {
        assetTagNo: 'LDPL-00001',
        name: 'Liberty Plant 235MW',
        category: 'mechanical',
        hierarchyLevel: 1,
        locationPath: 'Daharki, Ghotki, Sindh',
        departmentId: mechDept?.id,
        status: 'active',
        criticality: 'critical',
        createdById: admin.id,
      },
    });

    const coolingSystem = await prisma.asset.create({
      data: {
        assetTagNo: 'LDPL-00002',
        name: 'Cooling System',
        category: 'mechanical',
        parentId: plant.id,
        hierarchyLevel: 2,
        departmentId: mechDept?.id,
        status: 'active',
        criticality: 'high',
        createdById: admin.id,
      },
    });

    const coolingTower = await prisma.asset.create({
      data: {
        assetTagNo: 'LDPL-00003',
        name: 'Cooling Tower 1',
        category: 'mechanical',
        parentId: coolingSystem.id,
        hierarchyLevel: 3,
        locationPath: 'Cooling Tower Area / CT-1',
        departmentId: mechDept?.id,
        status: 'active',
        criticality: 'high',
        createdById: admin.id,
      },
    });

    const motor = await prisma.asset.create({
      data: {
        assetTagNo: 'LDPL-00004',
        name: 'Motor CT-01',
        category: 'electrical',
        parentId: coolingTower.id,
        hierarchyLevel: 4,
        make: 'Siemens',
        model: '1LA7 096-4AA60',
        serialNumber: 'SN-CT01-2022',
        purchaseDate: new Date('2022-06-15'),
        purchaseCost: 850000,
        currentValue: 680000,
        locationPath: 'Cooling Tower 1 / Motor Room',
        departmentId: mechDept?.id,
        assignedToId: engineer?.id,
        status: 'active',
        criticality: 'critical',
        warrantyExpiry: new Date('2025-06-15'),
        meterReading: 12450,
        meterUnit: 'Hours',
        notes: 'Primary cooling tower drive motor',
        createdById: admin.id,
      },
    });

    await prisma.asset.create({
      data: {
        assetTagNo: 'LDPL-00005',
        name: 'Bearing Assembly',
        category: 'mechanical',
        parentId: motor.id,
        hierarchyLevel: 5,
        make: 'SKF',
        model: '6312-2RS1',
        departmentId: mechDept?.id,
        status: 'active',
        criticality: 'medium',
        createdById: admin.id,
      },
    });

    console.log('Sample asset hierarchy seeded (Plant → Cooling System → CT-1 → Motor → Bearing)');
  }

  // Hourly rates for labor cost calculation
  await prisma.user.update({ where: { username: 'technician' }, data: { hourlyRate: 450 } });
  await prisma.user.update({ where: { username: 'engineer' }, data: { hourlyRate: 750 } });
  await prisma.user.update({ where: { username: 'supervisor' }, data: { hourlyRate: 900 } });

  const motor = await prisma.asset.findUnique({ where: { assetTagNo: 'LDPL-00004' } });
  const technician = await prisma.user.findUnique({ where: { username: 'technician' } });
  const supervisor = await prisma.user.findUnique({ where: { username: 'supervisor' } });

  const existingWo = await prisma.workOrder.findUnique({ where: { woNumber: 'WO-2026-00001' } });
  if (motor && technician && supervisor && !existingWo) {
    const wo1 = await prisma.workOrder.create({
      data: {
        woNumber: 'WO-2026-00001',
        type: 'CM',
        priority: 'critical',
        assetId: motor.id,
        problemDescription: 'Motor CT-01 abnormal vibration detected during routine inspection. Bearing noise audible.',
        reportedById: engineer?.id ?? admin.id,
        assignedToId: technician.id,
        assignedById: supervisor.id,
        estimatedHours: 4,
        status: 'in_progress',
        actualStartAt: new Date(),
        plannedStartDate: new Date(),
        plannedEndDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.woLabor.create({
      data: {
        workOrderId: wo1.id,
        userId: technician.id,
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 30 * 60 * 1000),
        hours: 1.5,
        description: 'Initial inspection and vibration analysis',
      },
    });

    await prisma.workOrder.create({
      data: {
        woNumber: 'WO-2026-00002',
        type: 'PM',
        priority: 'medium',
        assetId: motor.id,
        problemDescription: 'Scheduled monthly inspection — cooling tower motor CT-01',
        reportedById: engineer?.id ?? admin.id,
        status: 'open',
        estimatedHours: 2,
        plannedStartDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.asset.update({
      where: { id: motor.id },
      data: { status: 'under_maintenance' },
    });

    console.log('Sample work orders seeded (WO-2026-00001, WO-2026-00002)');
  }

  const motorAsset = await prisma.asset.findUnique({ where: { assetTagNo: 'LDPL-00004' } });
  const existingPm = await prisma.pmTemplate.findFirst({ where: { name: 'Monthly Motor CT-01 Inspection', deletedAt: null } });

  if (motorAsset && !existingPm) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5);

    const pmTemplate = await prisma.pmTemplate.create({
      data: {
        name: 'Monthly Motor CT-01 Inspection',
        assetId: motorAsset.id,
        frequency: 'monthly',
        intervalValue: 1,
        estimatedDuration: 2,
        requiredSkills: ['Electrical', 'Mechanical'],
        leadTimeDays: 7,
        assignedDeptId: mechDept?.id,
        lastDoneDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        nextDueDate: dueDate,
        isActive: true,
        checklist: [
          { sequence: 1, description: 'Check motor vibration levels' },
          { sequence: 2, description: 'Inspect bearing temperature' },
          { sequence: 3, description: 'Verify lubrication levels' },
          { sequence: 4, description: 'Clean air intake filters' },
        ],
        tasks: {
          create: [
            { sequence: 1, description: 'Check motor vibration levels', isRequired: true },
            { sequence: 2, description: 'Inspect bearing temperature', isRequired: true },
            { sequence: 3, description: 'Verify lubrication levels', isRequired: true },
            { sequence: 4, description: 'Clean air intake filters', isRequired: false },
          ],
        },
      },
    });

    await prisma.pmTemplate.create({
      data: {
        name: 'Quarterly Cooling Tower Inspection',
        assetCategory: 'mechanical',
        frequency: 'quarterly',
        intervalValue: 1,
        estimatedDuration: 4,
        requiredSkills: ['Mechanical'],
        leadTimeDays: 14,
        assignedDeptId: mechDept?.id,
        nextDueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        isActive: true,
        tasks: {
          create: [
            { sequence: 1, description: 'Inspect fill media condition' },
            { sequence: 2, description: 'Check water distribution system' },
            { sequence: 3, description: 'Test fan blade alignment' },
          ],
        },
      },
    });

    console.log('PM templates seeded:', pmTemplate.name);
  }

  const existingVendor = await prisma.vendor.findUnique({ where: { code: 'VND-SKF' } });
  let skfVendor = existingVendor;
  if (!existingVendor) {
    skfVendor = await prisma.vendor.create({
      data: {
        name: 'SKF Bearings Pakistan',
        code: 'VND-SKF',
        contactName: 'Sales Dept',
        contactPhone: '+92-21-111-SKF',
        category: 'mechanical',
        rating: 4.5,
      },
    });
    await prisma.vendor.create({
      data: {
        name: 'Siemens Pakistan',
        code: 'VND-SIE',
        contactName: 'Industrial Sales',
        contactPhone: '+92-21-111-SIE',
        category: 'electrical',
        rating: 4.7,
      },
    });
    console.log('Vendors seeded');
  }

  const existingItem = await prisma.inventoryItem.findUnique({ where: { itemCode: 'ITM-00001' } });
  if (!existingItem && skfVendor) {
    await prisma.inventoryItem.create({
      data: {
        itemCode: 'ITM-00001',
        name: 'Bearing 6312-2RS1 (SKF)',
        category: 'mechanical',
        unitOfMeasure: 'Nos',
        currentStock: 8,
        minimumStock: 4,
        maximumStock: 20,
        reorderQuantity: 10,
        unitCost: 12500,
        storeLocation: 'Shelf A-12',
        preferredVendorId: skfVendor.id,
        leadTimeDays: 14,
        barcode: 'ITM-00001',
        isCritical: true,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        itemCode: 'ITM-00002',
        name: 'Lubricating Oil SAE 40 (20L)',
        category: 'consumable',
        unitOfMeasure: 'Litre',
        currentStock: 45,
        minimumStock: 20,
        maximumStock: 100,
        reorderQuantity: 40,
        unitCost: 850,
        storeLocation: 'Shelf C-03',
        leadTimeDays: 7,
        barcode: 'ITM-00002',
      },
    });
    await prisma.inventoryItem.create({
      data: {
        itemCode: 'ITM-00003',
        name: 'V-Belt B-85',
        category: 'mechanical',
        unitOfMeasure: 'Nos',
        currentStock: 2,
        minimumStock: 5,
        maximumStock: 15,
        reorderQuantity: 8,
        unitCost: 3200,
        storeLocation: 'Shelf B-07',
        leadTimeDays: 10,
        barcode: 'ITM-00003',
        isCritical: false,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        itemCode: 'ITM-00004',
        name: 'Contactor 32A Siemens',
        category: 'electrical',
        unitOfMeasure: 'Nos',
        currentStock: 0,
        minimumStock: 2,
        maximumStock: 10,
        reorderQuantity: 5,
        unitCost: 18500,
        storeLocation: 'Shelf D-01',
        leadTimeDays: 21,
        barcode: 'ITM-00004',
        isCritical: true,
      },
    });
    console.log('Inventory items seeded (ITM-00001 to ITM-00004)');
  }

  const storekeeper = await prisma.user.findUnique({ where: { username: 'storekeeper' } });
  const storesDept = await prisma.department.findUnique({ where: { code: 'STR' } });
  const skfVendorForPr = await prisma.vendor.findUnique({ where: { code: 'VND-SKF' } });
  const vBeltItem = await prisma.inventoryItem.findUnique({ where: { itemCode: 'ITM-00003' } });
  const contactorItem = await prisma.inventoryItem.findUnique({ where: { itemCode: 'ITM-00004' } });

  const existingPr = await prisma.purchaseRequisition.findUnique({ where: { prNumber: 'PR-2026-00001' } });
  if (!existingPr && storekeeper && storesDept && vBeltItem && contactorItem && skfVendorForPr) {
    await prisma.purchaseRequisition.create({
      data: {
        prNumber: 'PR-2026-00001',
        requestedById: storekeeper.id,
        departmentId: storesDept.id,
        status: 'submitted',
        notes: 'Low stock reorder — V-Belts and Contactors',
        lineItems: {
          create: [
            {
              inventoryItemId: vBeltItem.id,
              description: 'V-Belt B-85 for cooling tower fan drive',
              quantity: 8,
              unit: 'Nos',
              estimatedUnitCost: 3200,
            },
            {
              inventoryItemId: contactorItem.id,
              description: 'Contactor 32A Siemens — critical spare',
              quantity: 5,
              unit: 'Nos',
              estimatedUnitCost: 18500,
            },
          ],
        },
      },
    });
    console.log('Sample PR seeded: PR-2026-00001 (submitted)');
  }

  console.log('Seed complete.');
  console.log('Default login: admin / Admin@123');

  const configDefaults: Record<string, unknown> = {
    company_name: 'Liberty Daharki Powers Ltd',
    plant_name: '235 MW Power Plant — Daharki',
    backup_enabled: true,
    backup_retention_days: 30,
    backup_schedule_hour: 2,
    session_timeout_hours: 8,
    max_login_attempts: 5,
    lockout_minutes: 15,
    maintenance_mode: false,
  };

  for (const [key, value] of Object.entries(configDefaults)) {
    await prisma.systemConfig.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never },
    });
  }
  console.log('System config seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
