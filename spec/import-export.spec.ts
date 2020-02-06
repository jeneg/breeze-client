import { Entity, EntityQuery, EntityType, MetadataStore, Predicate, breeze, MergeStrategy, DataProperty, NavigationProperty, core, QueryOptions, EntityManager, EntityKey, RelationArray, FetchStrategy, EntityState } from 'breeze-client';
import { TestFns, skipTestIf, skipDescribeIf } from './test-fns';

// function ok(a: any, b?: any) {
//   throw new Error('for test conversion purposes');
// }

TestFns.initServerEnv();

beforeAll(async () => {
  await TestFns.initDefaultMetadataStore();

});

describe("EntityManager import/export", () => {

  test("export/import - entityMetadata", function () {
    const em = TestFns.newEntityManager();
    const ets = em.metadataStore.getEntityTypes();
    const dataServices = em.metadataStore.dataServices;
    const exportedStore = em.metadataStore.exportMetadata();
    const newMs = new MetadataStore();
    newMs.importMetadata(exportedStore);
    const exportedStore2 = newMs.exportMetadata();
    expect(exportedStore.length).toBe(exportedStore2.length);
    const newEts = newMs.getEntityTypes();
    expect(ets.length).toBe(newEts.length);
    for (let i = 0; i < ets.length; i++) {
      const dataServices2 = newMs.dataServices;
      expect(dataServices.length).toBe(dataServices2.length);
      const et = ets[i];
      const st2 = newMs.getStructuralType(et.name);

      expect(et.name).toBe(st2.name);
      expect(et.dataProperties.length).toBe(st2.dataProperties.length);
      core.arrayZip(et.dataProperties, st2.dataProperties, function (dp1, dp2) {
        expect(dp1.name).toBe(dp2.name);
        expect(dp1.validators.length).toBe(dp2.validators.length);
      });
      if (et instanceof EntityType && st2 instanceof EntityType) {
        expect(et.keyProperties.length).toBe(st2.keyProperties.length);
        expect(et.navigationProperties.length).toBe(st2.navigationProperties.length);
        expect(et.defaultResourceName).toBe(st2.defaultResourceName);
        expect(et.autoGeneratedKeyType).toBe(st2.autoGeneratedKeyType);
        expect(et.concurrencyProperties.length).toBe(st2.concurrencyProperties.length);
      }

      expect(et.unmappedProperties.length).toBe(st2.unmappedProperties.length);
      expect(et.validators.length).toBe(st2.validators.length);
    }
  });

  test("export/import - entityManager", async function () {
    expect.hasAssertions();
    const em = TestFns.newEntityManager();
    const orderType = em.metadataStore.getAsEntityType("Order");
    // we want to have our reconsituted em to have different ids than our current em.
    em.keyGenerator.generateTempKeyValue(orderType);
    const empType = em.metadataStore.getAsEntityType("Employee");
    const custType = em.metadataStore.getAsEntityType("Customer");
    const order1 = em.addEntity(orderType.createEntity());
    expect(order1.entityAspect.wasLoaded).toBeFalsy();
    const emp1 = em.addEntity(empType.createEntity());
    expect(emp1.entityAspect.wasLoaded).toBeFalsy();
    emp1.setProperty("lastName", "bar");
    const cust1 = em.createEntity("Customer", { companyName: "foo" });
    
    expect(cust1.entityAspect.wasLoaded).toBeFalsy();
    order1.setProperty("employee", emp1);
    order1.setProperty("customer", cust1);
    const q = new EntityQuery().from("Employees").take(2);
    
    
    const qr1 = await em.executeQuery(q);
    expect(qr1.results.length).toBe(2);
    const exportedEm = em.exportEntities(null, { includeMetadata: false });
    const em2 = TestFns.newEntityManager();
    const r = em2.importEntities(exportedEm);
    // 5 = 3 created + 2 queried
    expect(r.entities.length).toBe(5);
    const keys = Object.keys(r.tempKeyMapping);
    expect(keys.length).toBe(3);
    const r2 = em2.executeQueryLocally(q);
    expect(r2.length).toBe(2);
    const addedOrders = em2.getChanges(orderType);
    expect(addedOrders.length).toBe(1);
    const addedCusts = em2.getChanges(custType);
    expect(addedCusts.length).toBe(1);
    const order1x = addedOrders[0];
    const cust1x = order1x.getProperty("customer");
    expect(cust1x).toBeTruthy();
    expect(cust1x.getProperty("companyName")).toBe("foo");
    const emp1x = order1x.getProperty("employee");
    expect(emp1x).toBeTruthy();
    expect(emp1x.getProperty("lastName")).toBe("bar");
  });

  test("export/import with partial entityManager", async function () {
    expect.hasAssertions();
    const em = TestFns.newEntityManager();
    const orderType = em.metadataStore.getAsEntityType("Order");
    // we want to have our reconsituted em to have different ids than our current em.
    em.keyGenerator.generateTempKeyValue(orderType);
    const empType = em.metadataStore.getAsEntityType("Employee");
    const custType = em.metadataStore.getAsEntityType("Customer");
    const order1 = em.addEntity(orderType.createEntity());
    expect(order1.entityAspect.wasLoaded).toBeFalsy();
    const emp1 = em.addEntity(empType.createEntity());
    expect(emp1.entityAspect.wasLoaded).toBeFalsy();
    emp1.setProperty("lastName", "bar");
    const cust1 = em.addEntity(custType.createEntity());
    cust1.setProperty("companyName", "foo");
    expect(cust1.entityAspect.wasLoaded).toBeFalsy();
    
    order1.setProperty("customer", cust1);
    const q = new EntityQuery().from("Customers").take(2);
    
    
    const qr1 = await em.executeQuery(q);
    expect(qr1.results.length).toBe(2);
    const cust2 = qr1.results[0];
    const exportedEm = em.exportEntities([order1, cust1, cust2]);
    const em2 = TestFns.newEntityManager();
    const r = em2.importEntities(exportedEm);
    expect(r.entities.length).toBe(3);
    const r2 = em2.executeQueryLocally(q);
    expect(r2.length).toBe(2);
    const addedOrders = em2.getChanges(orderType);
    expect(addedOrders.length).toBe(1);
    const addedCusts = em2.getChanges(custType);
    expect(addedCusts.length).toBe(1);
    const order1x = addedOrders[0];
    const cust1x = order1x.getProperty("customer");
    expect(cust1x).toBeTruthy();
    expect(cust1x.getProperty("companyName")).toBe("foo");
  });

  test("export/import changes to local storage and re-import",  function () {
    const em = TestFns.newEntityManager();

    // add a new Cust to the cache
    const newCust = em.addEntity(createCust(em, "Export/import safely #1"));
    // add some more
    em.addEntity(createCust(em, "Export/import safely #2"));
    em.addEntity(createCust(em, "Export/import safely #3"));

    const changes = em.getChanges();
    const changesExport = em.exportEntities(changes, {includeMetadata: false});
    const LocalStorage = require('node-localstorage').LocalStorage;
    const localStorage = new LocalStorage('./support');

    expect(localStorage).toBeTruthy();

    const stashName = "import-export-test-stash";
    localStorage.setItem(stashName, changesExport as string);

    em.clear();
    // em should be empty after clearing it
    expect(em.getEntities().length).toBe(0);
    const changesImport = localStorage.getItem(stashName);
    em.importEntities(changesImport);

    const entitiesInCache = em.getEntities();
    const restoreCount = entitiesInCache.length;
    expect(restoreCount).toBe(3);

    const restoredCust = entitiesInCache[0];
    const restoredState = restoredCust.entityAspect.entityState;
    expect(restoredState.isAdded()).toBe(true);
    expect(newCust).not.toBe(restoredCust);
  });

  test("export/import all entities as JSON", function () {
    expect(1);
    const em1 = TestFns.newEntityManager(), em2 = TestFns.newEntityManager();
    createCachedData(em1);
    const entities = em1.getEntities();
    const exp = em1.exportEntities(null, {asString: false, includeMetadata: false});
    const imps = em2.importEntities(exp).entities;

    expect(imps.length).toBe(entities.length);
  });

  test("export/import two entities as JSON", function () {
    const em1 = TestFns.newEntityManager();
    const em2 = TestFns.newEntityManager();
    createCachedData(em1);
    const emp  = em1.getEntities('Employee', breeze.EntityState.Added)[0];
    const cust = em1.getEntities('Customer', breeze.EntityState.Modified)[0];
    expect(emp != null && cust != null).toBe(true);

    const exp = em1.exportEntities([emp, cust], {asString: false, includeMetadata: false});
    em2.importEntities(exp);
    const imps = em2.getEntities();
    expect(imps.length).toBe(2);
    expect(em2.getEntities().length).toBe(2);
    expect(em2.getChanges().length).toBe(2);
  });

  test("export/import employees by type name as JSON", function () {
    const em1 = TestFns.newEntityManager();
    const em2 = TestFns.newEntityManager();
    createCachedData(em1);
    const emps = em1.getEntities(['Employee']);
    const empType = emps[0].entityType;

    const exp = em1.exportEntities(['Employee'], {asString: false, includeMetadata: false});
    em2.importEntities(exp);

    const imps = em2.getEntities();
    expect(imps.every( e => e.entityType === empType)).toBe(true);
    expect(imps.length).toBe(emps.length);

    const changes = em2.getChanges();
    expect(changes.length).toBe(3);
  });

  test("export/import employees by EntityType as JSON", function () {
    const em1 = TestFns.newEntityManager(), em2 = TestFns.newEntityManager();
    createCachedData(em1);
    const emps = em1.getEntities(['Employee']);
    const empType = emps[0].entityType;

    const exp = em1.exportEntities([empType], {asString: false, includeMetadata: false});
    const imps = em2.importEntities(exp).entities;

    expect(imps.every( e => e.entityType === empType)).toBe(true);
    expect(imps.length).toBe(emps.length);
    const changes = em2.getChanges();
    expect(changes.length).toBe(3);
  });

  test("export/import entities of empty 'Category' type as JSON", function () {
    const em1 = TestFns.newEntityManager(), em2 = TestFns.newEntityManager();
    createCachedData(em1);

    const catType = removeAllOfType(em1, 'Category');
    const exp = em1.exportEntities([catType], {asString: false, includeMetadata: false});
    const imps = em2.importEntities(exp).entities;
    expect(imps.length).toBe(0);
  });

  test("export/import entities of several types as JSON", function () {
    const em1 = TestFns.newEntityManager(), em2 = TestFns.newEntityManager();
    createCachedData(em1);

    const typeNames = ['Category', 'Customer', 'Employee'];

    // make one of the types an empty group
    removeAllOfType(em1, 'Category');

    const entities = em1.getEntities(typeNames);
    const expectedChanges = em1.getChanges(typeNames);

    const exp = em1.exportEntities(typeNames, {asString: false, includeMetadata: false});

    const imps = em2.importEntities(exp).entities;

    expect(imps.length).toBe(entities.length);
    const changes = em2.getChanges();
    expect(changes.length).toBe(expectedChanges.length);
  });

  test("export/import throws with unknown type", function () {

    const em1 = TestFns.newEntityManager(); 

    const func = () => {
      // there is no 'foo' type
      em1.exportEntities(['foo'], {asString: false, includeMetadata: false});
    };
    // /.*type.*foo/i, // error message like "Unable to locate a 'Type' by the name: 'foo'"
    expect(func).toThrow(/.*type.*foo/i);
  });

  test("export/import with tempkey", function () {
    const DT = breeze.DataType;
    const newMs = new MetadataStore();
    initializeMetadataStore(newMs);
    const em1 = new EntityManager({ metadataStore: newMs });
    const emp1 = em1.createEntity("Employee");
    expect(emp1.entityAspect.hasTempKey).toBe(true);
    let exportedEnts = em1.exportEntities();

    DT._resetConstants();
    const em2 = new EntityManager();
    const r2 = em2.importEntities(exportedEnts);
    expect(r2.entities.every(r => r.entityAspect.hasTempKey)).toBe(true);

    const emp2 = em2.createEntity("Employee");
    expect(emp2.entityAspect.hasTempKey).toBe(true);
    exportedEnts = em2.exportEntities();

    DT._resetConstants();
    const em3 = new EntityManager();
    const r3 = em3.importEntities(exportedEnts);
    expect(r3.entities.every(r => r.entityAspect.hasTempKey));
    const emp3 = em3.createEntity("Employee");
    expect(emp3.entityAspect.hasTempKey).toBe(true);
    expect(em3.getEntities().length).toBe(3);
  });

  function initializeMetadataStore(metadataStore: MetadataStore) {
    const DT = breeze.DataType;

    metadataStore.addEntityType({
      shortName: "Employee",
      namespace: "Context",
      autoGeneratedKeyType: breeze.AutoGeneratedKeyType.Identity,
      dataProperties: {
        id: {
          dataType: DT.Int64,
          isPartOfKey: true
        },
        name: {
          dataType: DT.String
        }
      }
    });
    metadataStore.setEntityTypeForResourceName('Employee', 'Employee');
  }

  test("export/import with deleted entities", async function () {
    expect.hasAssertions();
    const em = TestFns.newEntityManager();
    const custType = em.metadataStore.getAsEntityType("Customer");
    const cust1 = custType.createEntity();
    cust1.setProperty("companyName", "Test_js_1");
    cust1.setProperty("city", "Oakland");
    cust1.setProperty("rowVersion", 13);
    cust1.setProperty("fax", "510 999-9999");
    em.addEntity(cust1);
    const cust2 = custType.createEntity();
    cust2.setProperty("companyName", "Test_js_2");
    cust2.setProperty("city", "Oakland");
    cust2.setProperty("rowVersion", 13);
    cust2.setProperty("fax", "510 999-9999");
    em.addEntity(cust2);
    const sr = await em.saveChanges();

    const custs = sr.entities;
    expect(custs.length).toBe(2);
    custs[0].entityAspect.setDeleted();
    const newName = TestFns.morphString(custs[1].getProperty("companyName"));
    custs[1].setProperty("companyName", newName);
    const sr1 = await em.saveChanges();
    expect(sr1.entities.length).toBe(2);
    const exported = em.exportEntities(null, { includeMetadata: false });
    const em2 = TestFns.newEntityManager();
    em2.importEntities(exported);
  });

  test("export/import with null property values", async function () {
    expect.hasAssertions();
    const queryOptions = new QueryOptions({
      mergeStrategy: MergeStrategy.OverwriteChanges,
      fetchStrategy: FetchStrategy.FromServer
    });
    const em = TestFns.newEntityManager();
    const pred = new Predicate("companyName", "!=", null).and("city", "!=", null);
    const q = EntityQuery.from("Customers").where(pred).take(2)
      .using(MergeStrategy.OverwriteChanges);
    const qr1 = await em.executeQuery(q);
    const custs = qr1.results;
    custs[0].setProperty("companyName", null);
    custs[1].setProperty("city", null);
    //exported = em.exportEntities(null, {includeMetadata: false});
    // use the deprecated syntax to exclude metadata
    const exported = em.exportEntities(null, false);
    const em2 = TestFns.newEntityManager();
    em2.importEntities(exported);
    const cust0x = em2.findEntityByKey(custs[0].entityAspect.getKey());
    expect(cust0x.getProperty("companyName")).toBeNull();
    const cust1x = em2.findEntityByKey(custs[1].entityAspect.getKey());
    expect(cust1x.getProperty("city")).toBeNull();
    cust0x.setProperty("companyName", "Foo");
    cust1x.setProperty("city", "Foo");
    cust0x.entityAspect.acceptChanges();
    cust1x.entityAspect.acceptChanges();
    em2.importEntities(exported);
    expect(cust0x.getProperty("companyName")).toBeNull();
    expect(cust1x.getProperty("city")).toBeNull();
  });

  test("export/import with variety of first parameters", async function () {
    expect.hasAssertions();
    const queryOptions = new QueryOptions({
      mergeStrategy: MergeStrategy.OverwriteChanges,
      fetchStrategy: FetchStrategy.FromServer
    });
    const em = TestFns.newEntityManager();
    const pred = new breeze.Predicate("companyName", "!=", null).and("city", "!=", null);
    const q = EntityQuery.from("Customers").where(pred).take(2)
      .using(MergeStrategy.OverwriteChanges);
    const val = Date.now().toString();
    
    const qr1 = await em.executeQuery(q);
    // null case - 
    let exported = em.exportEntities(null, { includeMetadata: false });
    const em2 = TestFns.newEntityManager();
    em2.importEntities(exported);
    const all = new EntityQuery("Customers");
    let customers = em2.executeQueryLocally(all);
    expect(customers && customers.length === 2).toBe(true);
    // [] case
    exported = em.exportEntities([], { includeMetadata: false });
    const em3 = TestFns.newEntityManager();
    em3.importEntities(exported);
    customers = em3.executeQueryLocally(all);
    expect(customers && customers.length === 0).toBe(true);
    // [cust]
    const cust = qr1.results[0];
    exported = em.exportEntities([cust], { includeMetadata: false });
    const em4 = TestFns.newEntityManager();
    em4.importEntities(exported);
    customers = em4.executeQueryLocally(all);
    expect(customers && customers.length === 1).toBe(true);
  });

  /*********************************************************
    * Create an EM with parent/child relationship data.  Export the EM and import it into a new one, delete the child item in the exported EM
    * export the 2nd EM into the first EM.
    *********************************************************/
   test("test imported deleted nav properties", function () {
    const em = TestFns.newEntityManager();

    const parentCustomer = createCustomerAndOrders(em, true, 1);

    const newOrder = parentCustomer.getProperty("orders")[0];

    // clone the EM data; includeMetadata is true by default but we're being explicit in this test
    const expEntities = em.exportEntities(null, {includeMetadata: true});

    //const newEm = newEm();
    const newEM = new breeze.EntityManager();
    newEM.importEntities(expEntities, { mergeStrategy: breeze.MergeStrategy.OverwriteChanges });

    // delete the order
    const newOrderCopy = newEM.getEntities("Order")[0];
    newOrderCopy.entityAspect.setDeleted();

    // export the cloned EM
    const expEntitiesNew = newEM.exportEntities();
    // merge to the original EM
    em.importEntities(expEntitiesNew, { mergeStrategy: breeze.MergeStrategy.OverwriteChanges });

    const deletedOrders = parentCustomer.getProperty("orders");

    expect(newOrder.entityAspect.entityState.isDeleted()).toBe(true);
    expect(deletedOrders.length).toBe(0);
  });

  test("unmapped import export", function () {
    // use a different metadata store for this em - so we don't polute other tests

    const em1 = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Customer = function () {
      this.miscData = "asdf";
    };
    em1.metadataStore.registerEntityTypeCtor("Customer", Customer);

    const custType = em1.metadataStore.getAsEntityType("Customer");
    const cust = custType.createEntity();
    em1.addEntity(cust);
    cust.setProperty("companyName", "foo2");
    cust.setProperty("miscData", "zzz");
    const bundle = em1.exportEntities();
    const em2 = TestFns.newEntityManager(em1.metadataStore);
    em2.importEntities(bundle);
    const entities = em2.getEntities();
    expect(entities.length).toBe(1);
    const sameCust = entities[0];
    const cname = sameCust.getProperty("companyName");
    expect(cname).toBe("foo2");
    const miscData = sameCust.getProperty("miscData");
    expect(miscData).toBe("zzz");
  });

  test("unmapped import export unmapped suppressed", function () {
    // use a different metadata store for this em - so we don't polute other tests
    const em1 = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Customer = function () {
      this.miscData = "asdf";
    };
    em1.metadataStore.registerEntityTypeCtor("Customer", Customer);

    const custType = em1.metadataStore.getAsEntityType("Customer");
    const cust = custType.createEntity();
    em1.addEntity(cust);
    cust.setProperty("companyName", "foo2");
    cust.setProperty("miscData", "zzz");
    em1.metadataStore.setProperties({
      serializerFn: function (dp, value) {
        return dp.isUnmapped ? undefined : value;
      }
    });
    const bundle = em1.exportEntities(null, { includeMetadata: false });

    const em2 = TestFns.newEntityManager(em1.metadataStore);
    em2.importEntities(bundle);

    const entities = em2.getEntities();
    expect(entities.length).toBe(1);
    const sameCust = entities[0];
    const cname = sameCust.getProperty("companyName");
    expect(cname).toBe("foo2");
    const miscData = sameCust.getProperty("miscData");
    expect(miscData).toBeNull();

  });

  test("unmapped import export version mismatch", function () {

    // use a different metadata store for this em - so we don't polute other tests
    const em1 = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Customer = function () {
      this.miscData = "asdf";
    };
    em1.metadataStore.registerEntityTypeCtor("Customer", Customer);

    const custType = em1.metadataStore.getAsEntityType("Customer");
    const cust = custType.createEntity();
    em1.addEntity(cust);
    cust.setProperty("companyName", "foo2");
    cust.setProperty("miscData", "zzz");
    em1.metadataStore.setProperties({
      name: "version 1.1"
    });
    const bundle = em1.exportEntities(null, { includeMetadata: false });
    const em2 = TestFns.newEntityManager(em1.metadataStore);
    try {
      em2.importEntities(bundle, {
        metadataVersionFn: function (cfg) {
          if (em2.metadataStore.name !== cfg.metadataStoreName) {
            throw new Error("bad version");
          }
        }
      });

      em1.metadataStore.setProperties({
        name: "version 1.2"
      });

      em2.importEntities(bundle, {
        metadataVersionFn: function (cfg) {
          if (em2.metadataStore.name !== cfg.metadataStoreName) {
            throw new Error("bad version 2");
          }
        }
      });
      throw new Error('should not get here');
    } catch (e) {
      expect(e.message).toMatch(/bad version 2/);
    }

  });

  test("unmapped import export with ES5 props", function () {
    // use a different metadata store for this em - so we don't polute other tests
    const em1 = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Customer = TestFns.getCustomerWithES5PropsCtor();
    em1.metadataStore.registerEntityTypeCtor("Customer", Customer);

    const custType = em1.metadataStore.getAsEntityType("Customer");
    const cust = custType.createEntity();
    em1.addEntity(cust);
    cust.setProperty("companyName", "foo2");
    const cname = cust.getProperty("companyName");
    expect(cname).toBe("FOO2");
    cust.setProperty("miscData", "zzz");
    const bundle = em1.exportEntities();
    const em2 = TestFns.newEntityManager(em1.metadataStore);
    em2.importEntities(bundle);
    const entities = em2.getEntities();
    expect(entities.length).toBe(1);
    const sameCust = entities[0];
    const cname2 = sameCust.getProperty("companyName");
    expect(cname2).toBe("FOO2");
    const miscData = sameCust.getProperty("miscData");
    expect(miscData).toBe("zzz");
  });


  test("export/import with custom metadata", function () {
    const jsonMetadata = {
      "metadataVersion": "1.0.5",
      "dataServices": [
        {
          "serviceName": "api/Foo/",
          "hasServerMetadata": false,
          "jsonResultsAdapter": "webApi_default",
          "useJsonp": false
        }
      ],
      "structuralTypes": [
        {
          "shortName": "address",
          "namespace": "YourNamespace",
          "isComplexType": true,
          "dataProperties": [
            { "name": "street", "dataType": "String" },
            { "name": "city", "dataType": "String" },
            { "name": "country", "dataType": "String" }
          ]
        },
        {
          "shortName": "person",
          "namespace": "YourNamespace",
          "dataProperties": [
            { "name": "id", "dataType": "Int32", isPartOfKey: true },
            { "name": "name", "dataType": "String" },
            { "name": "hobbies", "dataType": "String" },
            { "name": "address", "complexTypeName": "address:#YourNamespace" }
          ]
        }
      ]
    };

    const manager = new breeze.EntityManager();
    manager.metadataStore.importMetadata(jsonMetadata);

    const person = manager.createEntity('person', { id: 1 });
    person.getProperty("address").setProperty("street", "Sample Street");


    const exportedMs = manager.metadataStore.exportMetadata();
    expect(exportedMs).toBeTruthy();
    const exportedEm = manager.exportEntities(); // also fails
    const manager2 = new breeze.EntityManager();
    manager2.importEntities(exportedEm);
    const ents = manager2.getEntities();
    expect(ents.length).toBe(1);
    const samePerson = ents[0];
    expect(samePerson.getProperty("id")).toBe(1);
    expect(samePerson.entityAspect.getPropertyValue("address.street")).toBe("Sample Street");
  });

  test("export/import complexTypes", async function () {
    expect.hasAssertions();
    const em = TestFns.newEntityManager();
    const em2 = TestFns.newEntityManager();
    const q = EntityQuery.from("Suppliers")
        .where("companyName", "startsWith", "P");
    
    const data = await em.executeQuery(q);
    const suppliers = data.results;
    const suppliersCount = suppliers.length;
    expect(suppliersCount).toBeGreaterThan(0);
    const orderType = em.metadataStore.getEntityType("Order") as EntityType;
    // we want to have our reconsituted em to have different ids than our current em.
    em.keyGenerator.generateTempKeyValue(orderType);
    const empType = em.metadataStore.getEntityType("Employee") as EntityType;
    const custType = em.metadataStore.getEntityType("Customer") as EntityType;
    const order1 = em.addEntity(orderType.createEntity());
    expect(order1.entityAspect.wasLoaded).toBeFalsy();
    const emp1 = em.addEntity(empType.createEntity());
    expect(emp1.entityAspect.wasLoaded).toBeFalsy();
    emp1.setProperty("lastName", "bar");
    const cust1 = em.createEntity("Customer", { companyName: "foo" });
    //const cust1 = em.addEntity(custType.createEntity());
    //cust1.setProperty("companyName", "foo");
    expect(cust1.entityAspect.wasLoaded).toBeFalsy();
    order1.setProperty("employee", emp1);
    order1.setProperty("customer", cust1);
    const exportedEm = em.exportEntities(null, { includeMetadata: false });
    em2.importEntities(exportedEm);
    const suppliers_1 = em2.getEntities("Supplier");
    expect(suppliers.length).toBe(suppliersCount);
    const addedOrders = em2.getChanges(orderType);
    expect(addedOrders.length).toBe(1);
    const addedCusts = em2.getChanges(custType);
    expect(addedCusts.length).toBe(1);
    const order1x = addedOrders[0];
    const cust1x = order1x.getProperty("customer");
    expect(cust1x).toBeTruthy();
    expect(cust1x.getProperty("companyName")).toBe("foo");
    const emp1x = order1x.getProperty("employee");
    expect(emp1x).toBeTruthy();
    expect(emp1x.getProperty("lastName")).toBe("bar");
  });



  test("import results notification", async function () {
    expect.hasAssertions();
    const em = TestFns.newEntityManager();
    const em2 = TestFns.newEntityManager();
    const alfredsID = '785efa04-cbf2-4dd7-a7de-083ee17b6ad2';
    const query = EntityQuery.from("Customers")
        .where(TestFns.wellKnownData.keyNames.customer, "==", alfredsID)
        .expand("orders")
        .using(em);
    

    let arrayChangedCount = 0;
    let adds: any[];
    const data = await query.execute();
    const customer = data.results[0];
    const exportedCustomer = em.exportEntities([customer], { includeMetadata: false });
    const exportedEm = em.exportEntities(null, { includeMetadata: false });
    em2.importEntities(exportedCustomer);
    const sameCustomer = em2.findEntityByKey(customer.entityAspect.getKey());
    const orders = sameCustomer.getProperty("orders") as RelationArray;
    expect(orders.length).toBe(0);
    orders.arrayChanged.subscribe(function (args) {
      arrayChangedCount++;
      adds = args.added;
    });
    const r = em2.importEntities(exportedEm);
    expect(r.entities).toBeTruthy();
    expect(r.tempKeyMapping).toBeTruthy();
    expect(arrayChangedCount).toBe(1);
    expect(adds && adds.length > 1).toBe(true);
  });


  test("import can safely merge and preserve or overwrite pending changes", function () {
    // D#2207
    const em1 = TestFns.newEntityManager();
    const customerType = em1.metadataStore.getAsEntityType("Customer");
    const customerKeyName = TestFns.wellKnownData.keyNames.customer;
    const cust1 = customerType.createEntity();
    const cust1Id = core.getUuid();
    cust1.setProperty(customerKeyName, cust1Id);
    cust1.setProperty("companyName", "Foo");
    em1.attachEntity(cust1);

    const exports = em1.exportEntities();

    // As if em2 queried for same customer
    const em2 = TestFns.newEntityManager();
    const cust1b = customerType.createEntity();
    cust1b.setProperty(customerKeyName, cust1Id);
    cust1b.setProperty("companyName", "Foo");
    em2.attachEntity(cust1b);

    // then the user changed it but hasn't saved.
    const changedName = "Changed name";
    cust1b.setProperty("companyName", changedName);

    // Import from em1
    em2.importEntities(exports);

    expect(cust1b.entityAspect.entityState.isModified()).toBe(true);
    // Fails: D#2207
    expect(cust1b.getProperty("companyName")).toEqual(changedName);


    em2.importEntities(exports,
        { mergeStrategy: MergeStrategy.OverwriteChanges });

    expect(cust1b.entityAspect.entityState.isUnchanged()).toBe(true);
    expect(cust1b.getProperty("companyName")).not.toEqual(changedName);

  });

  test("re-import - can re-import and merge an added entity w/ PERM key that was changed in another manager", function () {
      // D#2647 Reported https://github.com/Breeze/breeze.js/issues/49
      expect(2);
      const em1 = TestFns.newEntityManager();
      const em2 = TestFns.newEntityManager();

      // Customer has client-assigned keys
      const cust1 = em1.createEntity('Customer', {
          customerID: core.getUuid(),
          companyName: 'Added Company',
          contactName: 'Unforgettable'
      });

      // export cust1 to em2 (w/o metadata); becomes cust2
      let exported = em1.exportEntities([cust1], {includeMetadata: false});
      const cust2 = em2.importEntities(exported).entities[0];

      // change a property of the Customer while in em2;
      cust2.setProperty('companyName', 'Added Company + 1');

      // re-import customer from em2 back to em1 with OverwriteChanges
      exported = em2.exportEntities([cust2], {includeMetadata: false});
      em1.importEntities(exported, { mergeStrategy: breeze.MergeStrategy.OverwriteChanges });
      expect(cust1.getProperty('contactName')).toBe('Unforgettable');
      expect(cust1.getProperty('companyName')).toBe('Added Company + 1');
  });

  test("re-import - new entity w/ TEMP key that was changed in another manager is added, not merged", function () {
      // This question was raised in https://github.com/Breeze/breeze.js/issues/49
      expect(4);
      const em1 = TestFns.newEntityManager();
      const em2 = TestFns.newEntityManager();

      // Employee has store-generated temp keys
      const emp1 = em1.createEntity('Employee', {
          firstName: 'Ima',
          lastName: 'Unforgettable'
      });

      // export emp1 to em2 (w/o metadata); becomes emp2
      let exported = em1.exportEntities([emp1], {includeMetadata: false});
      const emp2 = em2.importEntities(exported).entities[0];

      // change a property of the Employee while in em2;
      emp2.setProperty('firstName', 'Ima B.');

      // re-import Employee from em2 back to em1 with OverwriteChanges
      exported = em2.exportEntities([emp2], {includeMetadata: false});
      const emp1b = em1.importEntities(exported,
                    // strategy doesn't matter actually
                    { mergeStrategy: breeze.MergeStrategy.OverwriteChanges })
                    .entities[0];

      expect(emp1.getProperty('employeeID')).not.toEqual(emp1b.getProperty('employeeID'));
      expect(emp1.getProperty('firstName')).toEqual('Ima');
        
      expect(emp1b.getProperty('firstName')).toEqual('Ima B.');
        
      expect(em1.getChanges().length).toBe(2);
  });

  test("re-import - new entity w/ TEMP key that was changed in another manager is merged if *mergeAdds* is true", function () {
      expect(3);
      const em1 = TestFns.newEntityManager();
      const em2 = TestFns.newEntityManager();

      // Employee has store-generated temp keys
      const emp1 = em1.createEntity('Employee', {
          firstName: 'Eunis',
          lastName: 'Guy'
      });

      // export emp1 to em2 (w/o metadata); becomes emp2
      let exported = em1.exportEntities([emp1], { includeMetadata: false });
      const emp2 = em2.importEntities(exported).entities[0];

      // change a property of the Employee while in em2;
      emp2.setProperty('firstName', 'Eunis A.');

      // re-import Employee from em2 back to em1 with OverwriteChanges
      exported = em2.exportEntities([emp2], { includeMetadata: false });
      const emp1b = em1.importEntities(exported,
                    {   mergeAdds: true,
                        mergeStrategy: breeze.MergeStrategy.OverwriteChanges
                    })
                    .entities[0];

      expect(emp1.getProperty('employeeID')).toBe(emp1b.getProperty('employeeID'));
      expect(emp1.getProperty('firstName')).toBe('Eunis A.');
      expect(em1.getChanges().length).toBe(1);
  });

  
  test("export/import with large data", async function () {
    const em1 = TestFns.newEntityManager();
    const q = new EntityQuery().from("CustomersAndOrders");

    const qr1 = await em1.executeQuery(q);
    const entities1 = em1.getEntities();
    const exportedMs = em1.metadataStore.exportMetadata();
    const exportedEm = em1.exportEntities() as string;
    expect(exportedEm.length).toBeGreaterThan(200000);
    const em2 = EntityManager.importEntities(exportedEm);
    const entities2 = em2.getEntities();
    expect(entities1.length).toBe(entities2.length);
    const exportedMs2 = em2.metadataStore.exportMetadata();
    const exportedEm2 = em2.exportEntities() as string;
    expect(exportedMs.length).toBe(exportedMs2.length);
    expect(exportedEm.length).toBe(exportedEm2.length);
  });
  

  // ////////////////////////
  function createCustomerAndOrders(em: EntityManager, shouldAttachUnchanged: boolean, orderCount: number) {
    if (!orderCount) orderCount = 3;
    if (shouldAttachUnchanged === undefined) shouldAttachUnchanged = true;
    const metadataStore = em.metadataStore;
    const customerType = em.metadataStore.getAsEntityType("Customer");
    const orderType = em.metadataStore.getAsEntityType("Order");

    const customer = em.createEntity(customerType);
    expect(customer.entityAspect.entityState.isAdded()).toBe(true);
    for (let i = 0; i < orderCount; i++) {
      const order = em.createEntity(orderType);
      customer.getProperty("orders").push(order);
      expect(order.entityAspect.entityState.isAdded()).toBe(true);
    }

    if (shouldAttachUnchanged) {
      customer.entityAspect.acceptChanges();
      const custId = customer.getProperty("customerID");
      customer.getProperty("orders").forEach((order: Entity) => {
        order.entityAspect.acceptChanges();
        expect(order.getProperty("customer")).toBe(customer);
        expect(order.getProperty("customerID")).toBe(custId);
        expect(order.entityAspect.entityState.isUnchanged()).toBe(true);
      });
    } else {
      const custId = customer.getProperty("customerID");
      customer.getProperty("orders").forEach((order: Entity) => {
        expect(order.getProperty("customer")).toBe(customer);
        expect(order.getProperty("customerID")).toBe(custId);
        expect(order.entityAspect.entityState.isAdded()).toBe(true);
      });
    }
    return customer;
  }



  function createCachedData(em: EntityManager) {
    const DEL = breeze.EntityState.Deleted;
    const UNCHG = breeze.EntityState.Unchanged;
    
    // Categories
    const cat1 = em.createEntity('Category', { categoryID: 1, categoryName: 'Animal' }, UNCHG);
    const cat2 = em.createEntity('Category', { categoryID: 2, categoryName: 'Vegetable' }, UNCHG);
    // Customers
    const cust1 = em.createEntity('Customer', {customerID: core.getUuid(), companyName: 'cust 1'});
    const cust2 = em.createEntity('Customer', {customerID: core.getUuid(), companyName: 'cust 2'}, UNCHG);
    em.createEntity('Customer', {customerID: core.getUuid(), companyName: 'cust 3'}, UNCHG);
    em.createEntity('Customer', {customerID: core.getUuid(), companyName: 'cust 3'}, DEL);
    // Employees
    em.createEntity('Employee', {firstName: 'Abe'});
    em.createEntity('Employee', {employeeID: 2, firstName: 'Beth'}, UNCHG);
    const emp1 = em.createEntity('Employee', {employeeID: 3, firstName: 'Cat'}, UNCHG);
    em.createEntity('Employee', {employeeID: 4, firstName: 'Don'}, DEL);
    // Orders
    em.createEntity('Order', {employee: emp1, customer: cust1, shipName: 'Acme'});
    const ord1 = em.createEntity('Order', {orderID: 12, employee: emp1, customer: cust1, shipName: 'Beta'}, UNCHG);
    em.createEntity('Order', {orderID: 13, employee: emp1, customer: cust2, shipName: 'Gamma'}, UNCHG);
    em.createEntity('Order', {orderID: 14, employee: emp1, customer: cust2, shipName: 'Delta'}, DEL);
    // Products
    const prod1 = em.createEntity('Product', { productName: 'Apple', category: cat2 });
    const prod2 = em.createEntity('Product', { productID: 22, productName: 'Beet', category: cat2 }, UNCHG);
    const prod3 = em.createEntity('Product', { productID: 23, productName: 'Cat', category: cat1 }, UNCHG);
    em.createEntity('Product', { productID: 24, productName: 'Dill', category: cat2 }, DEL);
    // OrderDetails
    em.createEntity('OrderDetail', {order: ord1, product: prod1, quantity: 1});
    const od1 = em.createEntity('OrderDetail', {order: ord1, product: prod2, quantity: 2}, UNCHG);
    em.createEntity('OrderDetail', { order: ord1, product: prod3, quantity: 3 }, UNCHG);

    // Modify some
    cust2.setProperty('companyName', 'cust2-M');
    emp1.setProperty('firstName', 'Cat-M');
    prod3.setProperty('productName', 'Carrot-M');
    od1.setProperty('quantity', 42);
  }

  function createCust(em: EntityManager, companyName: string) {
    const custType = em.metadataStore.getAsEntityType("Customer");
    const cust = custType.createEntity();
    cust.setProperty("companyName", companyName);
    return cust;
  }

  function removeAllOfType(em: EntityManager, typeName: string) {
    const type = em.metadataStore.getAsEntityType(typeName);
    const entities = em.getEntities(type);
    entities.forEach(function (e) {
      em.detachEntity(e);
    });
    return type;
  }

});
