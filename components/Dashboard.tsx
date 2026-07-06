import React, { useContext } from 'react';
import { AppContext } from '../App';
import CompanionDashboard from './CompanionDashboard';
import PartnerDashboard from './PartnerDashboard';

const Dashboard = () => {
  const { operatingMode } = useContext(AppContext);

  return operatingMode === 'companion' ? <CompanionDashboard /> : <PartnerDashboard />;
};

export default Dashboard;
