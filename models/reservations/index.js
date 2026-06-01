const { DataTypes } = require('sequelize');
 
module.exports = (sequelize) => {
 
  const Room = sequelize.define('Room', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  }, {
    tableName: 'rooms',
    timestamps: false,
  });
 
  const Department = sequelize.define('Department', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  }, {
    tableName: 'departments',
    timestamps: false,
  });
 
  const Employee = sequelize.define('Employee', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'departments', key: 'id' },
    },
  }, {
    tableName: 'employees',
    timestamps: false,
  });
 
  const Reservation = sequelize.define('Reservation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'rooms', key: 'id' },
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    reservingEmployeeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
    },
    registeredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    registeredByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
    },
  }, {
    tableName: 'reservations',
    timestamps: false,
  });
 
  // --- Associations ---
 
  Department.hasMany(Employee, {
    foreignKey: {
      name: 'departmentId',
      allowNull: false,
    },
    as: 'employees',
  });
 
  Employee.belongsTo(Department, {
    foreignKey: {
      name: 'departmentId',
      allowNull: false,
    },
    as: 'department',
  });
 
  Room.hasMany(Reservation, {
    foreignKey: {
      name: 'roomId',
      allowNull: false,
    },
    as: 'reservations',
  });
 
  Reservation.belongsTo(Room, {
    foreignKey: {
      name: 'roomId',
      allowNull: false,
    },
    as: 'room',
  });
 
  Reservation.belongsTo(Employee, {
    as: 'reservingEmployee',
    foreignKey: {
      name: 'reservingEmployeeId',
      allowNull: false,
    },
  });
 
  Reservation.belongsTo(Employee, {
    as: 'registeredBy',
    foreignKey: {
      name: 'registeredByUserId',
      allowNull: false,
    },
  });
 
  return { Room, Department, Employee, Reservation };
};