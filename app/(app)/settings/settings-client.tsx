"use client";

import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { BoxMasterTab } from "@/components/settings/box-master-tab";
import { ProductMasterTab } from "@/components/settings/product-master-tab";
import { BoxRulesTab } from "@/components/settings/box-rules-tab";

type Tab = "boxes" | "products" | "rules";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("boxes");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "boxes", label: "Box Master", icon: "inventory_2" },
    { id: "products", label: "Product Master", icon: "category" },
    { id: "rules", label: "Box Rules", icon: "rule" },
  ];

  return (
    <>
      <Topbar title="Cấu hình" subtitle="Cài đặt" />

      {/* Tab navigation */}
      <div
        className="flex gap-1 mb-4 p-1 rounded-lg"
        style={{ backgroundColor: "var(--bg-secondary)", width: "fit-content" }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded transition-colors"
              style={{
                backgroundColor: isActive ? "var(--accent-bg)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              <span className="material-symbols-outlined text-[18px]">
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {activeTab === "boxes" && <BoxMasterTab />}
        {activeTab === "products" && <ProductMasterTab />}
        {activeTab === "rules" && <BoxRulesTab />}
      </div>
    </>
  );
}
