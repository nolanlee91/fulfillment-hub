"use client";

import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { BoxMasterTab } from "@/components/settings/box-master-tab";
import { ProductMasterTab } from "@/components/settings/product-master-tab";
import { BoxRulesTab } from "@/components/settings/box-rules-tab";
import { CustomerMasterTab } from "@/components/settings/customer-master-tab";

type Tab = "customers" | "boxes" | "products" | "rules";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("customers");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "customers", label: "Customer Master", icon: "business" },
    { id: "boxes", label: "Box Master", icon: "inventory_2" },
    { id: "products", label: "Product Master", icon: "category" },
    { id: "rules", label: "Box Rules", icon: "rule" },
  ];

  return (
    <>
      <Topbar title="Cấu hình" subtitle="Cài đặt" />

      {/* Tab navigation */}
      <div className="status-tabs-bar mb-4" style={{ width: "fit-content" }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`status-tab${isActive ? " active" : ""}`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="card overflow-hidden">
        {activeTab === "customers" && <CustomerMasterTab />}
        {activeTab === "boxes" && <BoxMasterTab />}
        {activeTab === "products" && <ProductMasterTab />}
        {activeTab === "rules" && <BoxRulesTab />}
      </div>
    </>
  );
}
