"use client";

import { FiAlertTriangle } from "react-icons/fi";

/**
 * Banner to show on dashboard pages when maintenance mode is active
 * This helps organizers understand why their events might not be visible to the public
 */
export default function MaintenanceBanner() {
  return (
    <div className="warning-banner">
      <div className="warning-icon">
        <FiAlertTriangle size={20} />
      </div>
      <div className="warning-content">
        <strong>Maintenance Mode Active</strong>
        <p>
          The public-facing site is currently in maintenance mode. Your dashboard is accessible, 
          but users cannot view the homepage or events pages at this time.
        </p>
      </div>
    </div>
  );
}
