import { EntityManager, EntityType, ComplexType, EntityState, EntityAction, EntityChangedEventArgs, breeze, MetadataStore, SaveOptions, QueryOptions, ValidationOptions, Entity, DataType, core, EntityKey, RelationArray, MergeStrategy, AnyAllPredicate, EntityQuery, QueryResult, StructuralType, EntityProperty, DataProperty, NavigationProperty, EntityAspect } from 'breeze-client';
import { ModelLibraryBackingStoreAdapter } from 'breeze-client/adapter-model-library-backing-store';
import { TestFns, JsonObj } from './test-fns';

ModelLibraryBackingStoreAdapter.register();

TestFns.initNonServerEnv();

describe("Entity operations - no server", () => {

  beforeEach(function () {
    TestFns.initSampleMetadataStore();
  });

  test("can add unmapped 'foo' property directly to EntityType", function () {
    expect(3);
    const store = MetadataStore.importMetadata(TestFns.sampleMetadata);
    assertFooPropertyDefined(store, false);

    const customerType = store.getEntityType('Customer');
    const fooProp = new breeze.DataProperty({
      name: 'foo',
      defaultValue: 42,
      isUnmapped: true  // !!!
    });
    customerType.addProperty(fooProp);

    assertFooPropertyDefined(store, true);

    const cust = store.getAsEntityType('Customer').createEntity();
    const custID = cust.getProperty("customerID");
    const fooValue = cust.getProperty('foo');
    expect(fooValue).toBe(42);
  });

  test("merge new into deleted entity", function () {
    const em = TestFns.newEntityManager();
    const custX = em.createEntity("Customer");
    custX.entityAspect.acceptChanges();
    const cust = em.createEntity("Customer");
    // id will be new autogenerated Guid
    const id = cust.getProperty("customerID");
    // make it unmodified so that later delete does NOT detach it.
    cust.entityAspect.acceptChanges();
    cust.entityAspect.setDeleted();
    const sameCust = em.createEntity("Customer", { customerID: id }, null, MergeStrategy.OverwriteChanges);
    expect(sameCust.entityAspect.entityState).toBe(EntityState.Added);
    expect(sameCust.getProperty("customerID")).toBe(id);

    expect(sameCust).toBe(cust);
    em.rejectChanges();
  });

  test("new instead of createEntity with entityAspect", function () {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Customer = getCustomerCtor();
    em.metadataStore.registerEntityTypeCtor("Customer", Customer);
    const customerKeyName = TestFns.wellKnownData.keyNames.customer;

    const cust1 = new (Customer as any)();
    cust1.city = "xxx";
    const ea = new EntityAspect(cust1);
    cust1.setProperty("city", "yyy");
    cust1.setProperty(customerKeyName, breeze.core.getUuid());

    const cust2 = em.metadataStore.getAsEntityType("Customer").createEntity();
    cust2.setProperty(customerKeyName, breeze.core.getUuid());

    em.attachEntity(cust1);
    em.attachEntity(cust2);
    expect(em.getEntities().length).toBe(2);
  });


  test("new instead of createEntity w/o entityAspect", function () {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const Customer = getCustomerCtor();
    em.metadataStore.registerEntityTypeCtor("Customer", Customer);
    const customerKeyName = TestFns.wellKnownData.keyNames.customer;

    const cust0 = new (Customer as any)();
    cust0.setProperty("city", "zzz");
    cust0.setProperty(customerKeyName, breeze.core.getUuid());
    em.attachEntity(cust0);
    expect(cust0.getProperty("city")).toBe("zzz");

    const cust1 = new (Customer as any)();
    cust1.city = "zzz";
    const city = cust1.city;
    expect(city).toBe("zzz");
    cust1[customerKeyName] = breeze.core.getUuid();
    em.attachEntity(cust1);
    expect(cust1.getProperty("city")).toBe("zzz");
  });


  test("attaching entities in ctor makes fk values update", function () {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const initializer = function (sup: any) {
      const prod1 = em.createEntity("Product");
      sup.products.push(prod1);

      const prod2 = em.createEntity("Product");
      sup.products.push(prod2);
      // problem occurs because em._unattachedChildrenMap gets entries for old SupplierID:#Foo-0 and new SupplierID:#Foo--3
    };

    em.metadataStore.registerEntityTypeCtor("Supplier", null, initializer);

    const sup = em.createEntity("Supplier");

    expect(sup.getProperty("supplierID")).toBeLessThan(0);
    const prods = sup.getProperty("products");
    expect(prods[0].getProperty("productID")).toBeLessThan(0);
    expect(prods[0].getProperty("supplierID")).toBeLessThan(0);
    expect(prods[1].getProperty("productID")).toBeLessThan(0);
    expect(prods[1].getProperty("supplierID")).toBeLessThan(0);
  });


  test("event token is the same for different entities", function () {
    const em = TestFns.newEntityManager();

    const emp1 = em.createEntity("Employee", { firstName: "Joe1", lastName: "Smith1", birthDate: new Date(2000, 1, 1) });
    const emp2 = em.createEntity("Employee", { firstName: "Joe2", lastName: "Smith2", birthDate: new Date(2000, 1, 1) });

    const token1 = emp1.entityAspect.propertyChanged.subscribe(function (changeArgs) {
      const a = changeArgs;
    });
    const token2 = emp2.entityAspect.propertyChanged.subscribe(function (changeArgs) {
      const a = changeArgs;
    });

    expect(token1).not.toBe(token2);
  });

  test("set nullable props with an empty string", function () {
    const em = TestFns.newEntityManager();

    const emp = em.createEntity("Employee", { firstName: "Joe", lastName: "Smith", birthDate: new Date(2000, 1, 1) });
    const bd = emp.getProperty("birthDate");
    expect(bd != null);
    emp.setProperty("birthDate", "");
    const b2 = emp.getProperty("birthDate");
    expect(b2).toBeNull;
  });


  test("create and init relations", function () {
    const em = TestFns.newEntityManager();
    const orderKeyName = TestFns.wellKnownData.keyNames.order;
    const productKeyName = TestFns.wellKnownData.keyNames.product;
    let newDetail = null;
    // pretend parent entities were queried
    let cfg = {};
    cfg[orderKeyName] = 1;
    const parentOrder = em.createEntity("Order", cfg, breeze.EntityState.Unchanged);
    cfg = {};
    cfg[productKeyName] = 1;
    const parentProduct = em.createEntity("Product", cfg, breeze.EntityState.Unchanged);
    newDetail = em.createEntity("OrderDetail", { order: parentOrder, product: parentProduct });

    expect(newDetail && newDetail.entityAspect.entityState.isAdded()).toBe(true);
    expect(parentOrder.entityAspect.entityState.isUnchanged()).toBe(true);
    expect(parentProduct.entityAspect.entityState.isUnchanged()).toBe(true);
  });


  test("create and init relations - detached entities", function () {
    const em = TestFns.newEntityManager();
    const orderKeyName = TestFns.wellKnownData.keyNames.order;
    const productKeyName = TestFns.wellKnownData.keyNames.product;

    let newDetail = null;
    // pretend parent entities were queried
    let cfg = {};
    cfg[orderKeyName] = 1;
    const parentOrder = em.createEntity("Order", cfg, breeze.EntityState.Detached);
    cfg = {};
    cfg[productKeyName] = 1;
    const parentProduct = em.createEntity("Product", cfg, breeze.EntityState.Detached);
    newDetail = em.createEntity("OrderDetail", { order: parentOrder, product: parentProduct });

    expect(newDetail && newDetail.entityAspect.entityState.isAdded()).toBe(true);
    expect(parentOrder.entityAspect.entityState.isAdded()).toBe(true);
    expect(parentProduct.entityAspect.entityState.isAdded()).toBe(true);
  });





  test("create entity with non-null dates", function () {
    const em = TestFns.newEntityManager(); // new empty EntityManager
    const userType = em.metadataStore.getAsEntityType("User");
    const userKeyName = TestFns.wellKnownData.keyNames.user;
    const user = userType.createEntity();

    const crtnDate = user.getProperty("createdDate");
    const modDate = user.getProperty("modifiedDate");
    expect(core.isDate(crtnDate)).toBe(true);
    expect(core.isDate(modDate)).toBe(true);
    em.addEntity(user);
    // need to do this after the addEntity call
    const id = user.getProperty(userKeyName);
    const exported = em.exportEntities(null, { includeMetadata: false });
    const em2 = TestFns.newEntityManager();
    em2.importEntities(exported);
    const user2 = em2.getEntityByKey("User", id);
    const crtnDate2 = user2.getProperty("createdDate");
    const modDate2 = user2.getProperty("modifiedDate");
    expect(core.isDate(crtnDate2)).toBe(true);
    expect(core.isDate(modDate2)).toBe(true);
    expect(crtnDate2.getTime()).toBe(crtnDate.getTime());
    expect(modDate2.getTime()).toBe(modDate.getTime());
  });


  test("create entity with initial properties", function () {
    const em = TestFns.newEntityManager(); // new empty EntityManager
    const empType = em.metadataStore.getAsEntityType("Employee");
    const employeeKeyName = TestFns.wellKnownData.keyNames.employee;
    let cfg: JsonObj = {
      firstName: "John",
      lastName: "Smith"
    };

    const testVal = 42;

    cfg[employeeKeyName] = TestFns.wellKnownData.dummyEmployeeID;
    const employee = empType.createEntity(cfg);
    expect(employee.getProperty("firstName")).toBe("John");
    expect(employee.getProperty(employeeKeyName)).toBe(TestFns.wellKnownData.dummyEmployeeID);

    cfg = {
      firstxame: "John",
      lastName: "Smith"
    };
    cfg[employeeKeyName] = TestFns.wellKnownData.dummyEmployeeID;
    const partialEmp = empType.createEntity(cfg);
    expect(employee.getProperty("lastName")).toBe("Smith");
  });

  test("entityType.getProperty nested", function () {
    const odType = TestFns.sampleMetadataStore.getEntityType("OrderDetail");
    const orderType = TestFns.sampleMetadataStore.getEntityType("Order");

    const customerProp = odType.getProperty("order.customer");
    const customerProp2 = orderType.getProperty("customer");
    expect(customerProp).toBeTruthy();
    expect(customerProp).toBe(customerProp2);
    const prop1 = odType.getProperty("order.customer.companyName");
    const prop2 = orderType.getProperty("customer.companyName");
    expect(prop1).toBeTruthy();
    expect(prop1).toBe(prop2);
  });




  test("generate ids", function () {
    const orderType = TestFns.sampleMetadataStore.getAsEntityType("Order");
    const em = TestFns.newEntityManager();
    const count = 10;
    for (let i = 0; i < count; i++) {
      const ent = orderType.createEntity();
      em.addEntity(ent);
    }
    const tempKeys = em.keyGenerator.getTempKeys();
    expect(tempKeys.length).toBe(count);
    tempKeys.forEach(function (k) {
      expect(em.keyGenerator.isTempKey(k)).toBe(true);
    });
  });

  test("createEntity and check default values", function () {
    const et = TestFns.sampleMetadataStore.getAsEntityType("Customer");
    checkDefaultValues(et);
    const entityTypes = TestFns.sampleMetadataStore.getEntityTypes();
    entityTypes.forEach(function (et) {
      checkDefaultValues(et);
    });
  });


  test("propertyChanged", function () {

    const em = TestFns.newEntityManager();
    const orderType = em.metadataStore.getAsEntityType("Order");
    expect(orderType).toBeTruthy();
    const orderDetailType = em.metadataStore.getAsEntityType("OrderDetail");
    expect(orderDetailType).toBeTruthy();
    const order = orderType.createEntity() as Entity;
    let lastProperty, lastOldValue, lastNewValue: any;
    order.entityAspect.propertyChanged.subscribe(function (args) {
      expect(args.entity).toBe(order);
      lastProperty = args.propertyName;
      lastOldValue = args.oldValue;
      lastNewValue = args.newValue;
    });
    const order2 = orderType.createEntity();

    order.setProperty("employeeID", 1);
    order2.setProperty("employeeID", 999); // should not raise event
    expect(lastProperty).toBe("employeeID");
    expect(lastNewValue).toBe(1);
    order.setProperty("freight", 123.34);
    expect(lastProperty).toBe("freight");
    expect(lastNewValue).toBe(123.34);
    order.setProperty("shippedDate", new Date(2000, 1, 1));
    expect(lastProperty).toBe("shippedDate");
    expect(lastNewValue!.toDateString()).toEqual(new Date(2000, 1, 1).toDateString());

    order.setProperty("employeeID", 2);
    expect(lastProperty).toBe("employeeID");
    expect(lastNewValue).toBe(2);
    expect(lastOldValue).toBe(1);
  });

  test("propertyChanged unsubscribe", function () {
    const em = TestFns.newEntityManager();
    const orderType = em.metadataStore.getAsEntityType("Order");
    const orderKeyName = TestFns.wellKnownData.keyNames.order;
    expect(orderType);
    const order = orderType.createEntity() as Entity;
    let lastProperty, lastOldValue, lastNewValue;
    const key = order.entityAspect.propertyChanged.subscribe(function (args) {
      lastProperty = args.propertyName;
      lastOldValue = args.oldValue;
      lastNewValue = args.newValue;
    });
    order.setProperty(orderKeyName, TestFns.wellKnownData.dummyOrderID);
    expect(lastProperty).toBe(orderKeyName);
    expect(lastNewValue).toBe(TestFns.wellKnownData.dummyOrderID);
    order.entityAspect.propertyChanged.unsubscribe(key);
    order.setProperty("employeeID", TestFns.wellKnownData.dummyEmployeeID);
    expect(lastProperty).toBe(orderKeyName);
    expect(lastNewValue).toBe(TestFns.wellKnownData.dummyOrderID);
  });


  test("delete entity - check children", function () {

    const em = TestFns.newEntityManager();
    const order = createOrderAndDetails(em, true);
    const orderId = order.getProperty("orderID");
    const details = order.getProperty("orderDetails");
    const copyDetails = details.slice(0);
    expect(details.length).toBeGreaterThan(0);
    order.entityAspect.setDeleted();
    expect(order.entityAspect.entityState.isDeleted()).toBe(true);

    expect(details.length).toBe(0);

    copyDetails.forEach(function (od: Entity) {
      expect(od.getProperty("order")).toBeNull();
      expect(od.getProperty("orderID")).toBe(orderId);
      expect(od.entityAspect.entityState.isModified()).toBe(true);
    });
  });


  test("delete entity children then parent - check children", function () {
    const em = TestFns.newEntityManager();
    const order = createOrderAndDetails(em, true);
    const orderID = order.getProperty("orderID");
    const details = order.getProperty("orderDetails");
    const copyDetails = details.slice(0);
    expect(details.length).toBeGreaterThan(0);
    copyDetails.forEach(function (od: Entity) {
      od.entityAspect.setDeleted();
    });
    order.entityAspect.setDeleted();
    expect(order.entityAspect.entityState.isDeleted()).toBe(true);

    expect(details.length).toBe(0);

    copyDetails.forEach(function (od: Entity) {
      expect(od.getProperty("order")).toBeNull();
      expect(od.getProperty("orderID")).toBe(orderID);
      expect(od.entityAspect.entityState.isDeleted()).toBe(true);
    });
  });


  test("delete entity children then parent - check children (guid ids)", function () {

    const em = TestFns.newEntityManager();
    const customer = createCustomerAndOrders(em, true);
    const custID = customer.getProperty("customerID");
    const orders = customer.getProperty("orders");
    const copyOrders = orders.slice(0);
    expect(copyOrders.length).toBeGreaterThan(0);
    copyOrders.forEach(function (order: Entity) {
      order.entityAspect.setDeleted();
    });
    customer.entityAspect.setDeleted();
    expect(customer.entityAspect.entityState.isDeleted()).toBe(true);

    expect(orders.length).toBe(0);

    copyOrders.forEach(function (order: Entity) {
      expect(order.getProperty("customer")).toBeNull();
      expect(order.getProperty("customerID")).toBe(custID);
      expect(order.entityAspect.entityState.isDeleted()).toBe(true);
    });
  });


  test("delete entity - check parent", function () {

    const em = TestFns.newEntityManager();
    const order = createOrderAndDetails(em, true);
    const details = order.getProperty("orderDetails");
    const od = details[0];
    expect(details.indexOf(od) !== -1).toBe(true);
    const copyDetails = details.slice(0);
    expect(details.length).toBeGreaterThan(0);
    od.entityAspect.setDeleted();
    expect(od.entityAspect.entityState.isDeleted()).toBe(true);

    expect(details.length).toBe(copyDetails.length - 1);
    expect(details.indexOf(od)).toBe(-1);

    expect(od.getProperty("order")).toBeNull();
    const defaultOrderId = od.entityType.getProperty("orderID").defaultValue;
    // we deliberately leave the orderID alone after a delete - we are deleting the entity and do not want a 'mod' to cloud the issue
    // ( but we do 'detach' the Order itself.)
    expect(od.getProperty("orderID")).toBe(order.getProperty("orderID"));
  });


  test("detach entity - check children", function () {

    const em = TestFns.newEntityManager();
    const order = createOrderAndDetails(em);
    const orderKeyName = TestFns.wellKnownData.keyNames.order;
    const orderId = order.getProperty(orderKeyName);
    const details = order.getProperty("orderDetails");
    const copyDetails = details.slice(0);
    expect(details.length).toBeGreaterThan(0);
    em.detachEntity(order);
    expect(order.entityAspect.entityState.isDetached()).toBe(true);

    expect(details.length).toBe(0);

    copyDetails.forEach(function (od: Entity) {
      expect(od.getProperty("order")).toBeNull();
      expect(od.getProperty(orderKeyName)).toBe(orderId);
      expect(od.entityAspect.entityState.isUnchanged()).toBe(true);
    });
  });


  test("hasChanges", function () {

    const em = TestFns.newEntityManager();

    const orderType = em.metadataStore.getAsEntityType("Order");
    const orderDetailType = em.metadataStore.getAsEntityType("OrderDetail");
    const order1 = createOrderAndDetails(em, false);
    const order2 = createOrderAndDetails(em, false);

    let valid = em.hasChanges();
    expect(valid).toBe(true);
    try {
      const x = em.hasChanges("order");
      throw new Error('should not get here');
    } catch (e) {
      expect(e.message).toMatch(/order/);
    }
    valid = em.hasChanges("Order");
    expect(valid).toBe(true);
    try {
      const y = em.hasChanges(["Order", "OrderDetXXX"]);
      throw new Error('should not get here');
    } catch (e) {
      expect(e.message).toMatch(/OrderDetXXX/);
    }
    valid = em.hasChanges([orderType, orderDetailType]);
    expect(valid).toBe(true);
    em.getChanges(orderType).forEach(function (e) {
      e.entityAspect.acceptChanges();
    });
    valid = !em.hasChanges(orderType);
    expect(valid).toBe(true);
    valid = em.hasChanges("OrderDetail");
    expect(valid).toBe(true);
    em.getChanges(orderDetailType).forEach(function (e) {
      e.entityAspect.acceptChanges();
    });

    valid = !em.hasChanges(["Order", "OrderDetail"]);
    expect(valid).toBe(true);
    valid = !em.hasChanges();
    expect(valid).toBe(true);
  });


  test("rejectChanges", function () {

    const em = TestFns.newEntityManager();
    const orderType = em.metadataStore.getAsEntityType("Order");
    const orderDetailType = em.metadataStore.getAsEntityType("OrderDetail");
    const order1 = createOrderAndDetails(em, false);
    const order2 = createOrderAndDetails(em, false);

    let valid = em.hasChanges();
    expect(valid).toBe(true);
    valid = em.hasChanges(orderType);
    expect(valid).toBe(true);
    valid = em.hasChanges([orderType, orderDetailType]);
    expect(valid).toBe(true);
    em.getChanges(orderType).forEach(function (e) {
      e.entityAspect.acceptChanges();
      e.setProperty("freight", 100);
      expect(e.entityAspect.entityState.isModified()).toBe(true);
    });
    const rejects = em.rejectChanges();
    expect(rejects.length).toBeGreaterThan(0);
    let hasChanges = em.hasChanges(orderType);
    expect(hasChanges).toBe(false);
    hasChanges = em.hasChanges(orderDetailType);
    expect(hasChanges).toBe(false);

    valid = !em.hasChanges();
    expect(valid).toBe(true);
  });

  function getCustomerCtor() {
    const ctor = function () {
      this.miscData = "asdf";
      this.getNameLength = function () {
        return (this.getProperty("companyName") || "").length;
      };
    };
    return ctor;
  }

  // const Customer = function () {
  //   this.miscData = "asdf";
  //   this.getNameLength = function () {
  //     return (this.getProperty("companyName") || "").length;
  //   };
  // };

  // class Customer {
  //   miscData: string;
  //   constructor() {
  //     this.miscData = "asdf";
  //   }

  //   getNameLength() {
  //     return ((this as any).getProperty("companyName") || "").length;
  //   }
  // }

  function assertFooPropertyDefined(metadataStore: MetadataStore, shouldBe: boolean) {
    const custType = metadataStore.getAsEntityType("Customer");
    const fooProp = custType.getDataProperty('foo');
    if (shouldBe) {
      expect(fooProp && fooProp.isUnmapped).toBe(true);
    } else {
      // 'foo' property should NOT be defined before registration.
      expect(!fooProp).toBe(true);
    }
    return fooProp;
  }

  function createOrderAndDetails(em: EntityManager, shouldAttachUnchanged: boolean = true) {

    const metadataStore = em.metadataStore;
    const orderType = em.metadataStore.getAsEntityType("Order");
    const orderDetailType = em.metadataStore.getAsEntityType("OrderDetail");
    const order = em.createEntity(orderType);

    expect(order.entityAspect.entityState.isAdded()).toBe(true);
    for (let i = 0; i < 3; i++) {
      const od = orderDetailType.createEntity();
      od.setProperty("productID", i + 1); // part of pk
      order.getProperty("orderDetails").push(od);
      expect(od.entityAspect.entityState.isAdded()).toBe(true);
    }
    const orderId = order.getProperty("orderID");
    expect(orderId).not.toBe(0);
    if (shouldAttachUnchanged) {
      order.entityAspect.acceptChanges();
      order.getProperty("orderDetails").forEach(function (od: Entity) {
        od.entityAspect.acceptChanges();
        expect(od.getProperty("order")).toBe(order);
        expect(od.getProperty("orderID")).toBe(orderId);
        expect(od.entityAspect.entityState.isUnchanged()).toBe(true);
      });
    } else {
      order.getProperty("orderDetails").forEach(function (od: Entity) {
        expect(od.getProperty("order")).toBe(order);
        expect(od.getProperty("orderID")).toBe(orderId);
        expect(od.entityAspect.entityState.isAdded()).toBe(true);
      });
    }
    return order;
  }

  function createCustomerAndOrders(em: EntityManager, shouldAttachUnchanged: boolean = true, orderCount: number = 3) {
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

  function checkDefaultValues(structType: StructuralType) {
    const props = structType.getProperties();
    expect(props.length).toBeGreaterThan(0);
    const fn = (structType as EntityType).createEntity || (structType as ComplexType).createInstance;
    const entity = fn.apply(structType);
    props.forEach(function (p: DataProperty | NavigationProperty) {
      const v = entity.getProperty(p.name);
      if (p.isUnmapped) {
        // do nothing
      } else if (p.isDataProperty) {
        const px = p as DataProperty; // needed for typescript
        if (px.isScalar) {
          if (px.isComplexProperty) {
            expect(v !== null).toBe(true);
          } else if (px.defaultValue != null) {
            expect(v).toBe(px.defaultValue);
          } else if (px.isNullable) {
            expect(v).toBeNull();
          }
        } else {
          expect(v.arrayChanged).toBeTruthy();
        }
      } else {
        if (p.isScalar) {
          expect(v).toBeNull();
        } else {
          // relation array
          expect(v.arrayChanged).toBeTruthy();
        }
      }
    });
  }

});