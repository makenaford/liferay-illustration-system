/**
 * THE GLASS ICON FOLDERS — where each glass icon belongs, by what it means,
 * one home per icon, in place of the 21 folders the Figma file named.
 *
 * Keyed by the icon's library id, which is its original Figma name slugged
 * ("Business - Costly" is `business-costly`), so it holds however the icon
 * has been moved or renamed since. The site's Glass icons set offers to apply
 * it — Apply new folders — which files each icon here and fixes the names'
 * typos; an icon not listed is left where it is.
 */

/** The folders, in the order the set lists them. */
export const GLASS_FOLDERS = ["Products", "Solutions", "Industries", "Security & compliance", "Operations", "Data & content", "Customers & service", "Business value", "People & learning", "Status & tips"];

export const GLASS_ICON_FOLDERS: Record<string, { folder: string; name: string }> = {
  "general-ai": { folder: "Products", name: "AI" }, // was General - ai
  "product-modules-ai-agent-studio": { folder: "Products", name: "Ai agent studio" }, // was Product Modules - Ai agent studio
  "product-modules-ai-agent-studio-2": { folder: "Products", name: "Ai agent studio 2" }, // was Product Modules - Ai agent studio 2
  "product-modules-ai-agent-studio-3": { folder: "Products", name: "Ai agent studio 3" }, // was Product Modules - Ai agent studio 3
  "product-modules-analytics": { folder: "Products", name: "Analytics" }, // was Product Modules - Analytics
  "product-modules-cdn": { folder: "Products", name: "CDN" }, // was Product Modules - CDN
  "product-modules-cdn-2": { folder: "Products", name: "CDN 2" }, // was Product Modules - CDN 2
  "product-modules-cdn-3": { folder: "Products", name: "CDN 3" }, // was Product Modules - CDN 3
  "product-modules-ci-cd": { folder: "Products", name: "CI CD" }, // was Product Modules - CI CD
  "product-modules-ci-cd-2": { folder: "Products", name: "CI CD 2" }, // was Product Modules - CI CD 2
  "product-modules-cloud-native-experience": { folder: "Products", name: "Cloud Native Experience" }, // was Product Modules - Cloud Native Experience
  "product-modules-cloud-native-experience-2": { folder: "Products", name: "Cloud Native Experience 2" }, // was Product Modules - Cloud Native Experience 2
  "product-modules-commerce": { folder: "Products", name: "Commerce" }, // was Product Modules - Commerce
  "product-modules-commerce-2": { folder: "Products", name: "Commerce 2" }, // was Product Modules - Commerce 2
  "general-composable": { folder: "Products", name: "Composable" }, // was General - Composable
  "product-modules-content-marketing-platform": { folder: "Products", name: "Content Marketing Platform" }, // was Product Modules - Content Marketing Platform
  "product-modules-content-marketing-platform-2": { folder: "Products", name: "Content Marketing Platform 2" }, // was Product Modules - Content Marketing Platform 2
  "product-modules-content-marketing-platform-3": { folder: "Products", name: "Content Marketing Platform 3" }, // was Product Modules - Content Marketing Platform 3
  "product-modules-content-marketing-platform-4": { folder: "Products", name: "Content Marketing Platform 4" }, // was Product Modules - Content Marketing Platform 4
  "general-developer-tools": { folder: "Products", name: "Developer Tools" }, // was General - Developer Tools
  "general-device": { folder: "Products", name: "Device" }, // was General - Device
  "product-modules-digital-sales-rooms": { folder: "Products", name: "Digital Sales Rooms" }, // was Product Modules - Digital Sales Rooms
  "product-modules-digital-sales-rooms-2": { folder: "Products", name: "Digital Sales Rooms 2" }, // was Product Modules - Digital Sales Rooms 2
  "product-modules-digital-sales-rooms-3": { folder: "Products", name: "Digital Sales Rooms 3" }, // was Product Modules - Digital Sales Rooms 3
  "product-modules-digital-sales-rooms-4": { folder: "Products", name: "Digital Sales Rooms 4" }, // was Product Modules - Digital Sales Rooms 4
  "product-modules-dxp": { folder: "Products", name: "DXP" }, // was Product Modules - DXP
  "industries-integration": { folder: "Products", name: "Integration (Industries)" }, // was Industries - Integration
  "product-modules-integration": { folder: "Products", name: "Integration (Product Modules)" }, // was Product Modules - Integration
  "general-liferay-data-platform": { folder: "Products", name: "Liferay Data Platform" }, // was General - Liferay Data Platform
  "product-modules-low-code": { folder: "Products", name: "Low-Code" }, // was Product Modules - Low-Code
  "product-modules-low-code-2": { folder: "Products", name: "Low-Code 2" }, // was Product Modules - Low-Code 2
  "general-out-of-the-box": { folder: "Products", name: "Out of the box" }, // was General - Out of the box
  "product-modules-out-of-the-box2": { folder: "Products", name: "Out of the box2" }, // was Product Modules - Out of the box2
  "product-modules-out-of-the-box2-2": { folder: "Products", name: "Out of the box2 2" }, // was Product Modules - Out of the box2 2
  "product-modules-out-of-the-box2-3": { folder: "Products", name: "Out of the box2 3" }, // was Product Modules - Out of the box2 3
  "general-out-of-the-box3": { folder: "Products", name: "Out of the box3" }, // was General - Out of the box3
  "general-paas": { folder: "Products", name: "PaaS" }, // was General - PaaS
  "product-modules-saas": { folder: "Products", name: "SaaS" }, // was Product Modules - SaaS
  "product-modules-saas-2": { folder: "Products", name: "SaaS 2" }, // was Product Modules - SaaS 2
  "business-self-hosted": { folder: "Products", name: "Self Hosted" }, // was Business - Self Hosted
  "product-modules-vpn": { folder: "Products", name: "VPN" }, // was Product Modules - VPN
  "product-modules-vpn-2": { folder: "Products", name: "VPN 2" }, // was Product Modules - VPN 2
  "product-modules-workflow-automation": { folder: "Products", name: "Workflow & Automation" }, // was Product Modules - Workflow & Automation
  "product-modules-workflow-automation-2": { folder: "Products", name: "Workflow & Automation 2" }, // was Product Modules - Workflow & Automation 2
  "customer-customer-portals": { folder: "Solutions", name: "Customer Portals" }, // was Customer - Customer Portals
  "solutions-digital-commerce": { folder: "Solutions", name: "Digital Commerce" }, // was Solutions - Digital Commerce
  "solutions-digital-commerce-2": { folder: "Solutions", name: "Digital Commerce 2" }, // was Solutions - Digital Commerce 2
  "business-enterprise-website-4": { folder: "Solutions", name: "Enterprise Website 4" }, // was Business - Enterprise Website 4
  "services-intranets": { folder: "Solutions", name: "Intranets" }, // was Services - Intranets
  "solutions-partner-portals": { folder: "Solutions", name: "Partner Portals" }, // was Solutions - Partner Portals
  "solutions-partner-portals-2": { folder: "Solutions", name: "Partner Portals 2" }, // was Solutions - Partner Portals 2
  "content-sites": { folder: "Solutions", name: "Sites" }, // was Content - Sites
  "solutions-supplier-portals": { folder: "Solutions", name: "Supplier Portals" }, // was Solutions - Supplier Portals
  "solutions-supplier-portals-2": { folder: "Solutions", name: "Supplier Portals 2" }, // was Solutions - Supplier Portals 2
  "solutions-supplier-portals-3": { folder: "Solutions", name: "Supplier Portals 3" }, // was Solutions - Supplier Portals 3
  "industries-asset-management": { folder: "Industries", name: "Asset Management" }, // was Industries - Asset Management
  "industries-asset-management2": { folder: "Industries", name: "Asset Management 2" }, // was Industries - Asset Management2
  "industries-energy-and-supply": { folder: "Industries", name: "Energy and Supply" }, // was Industries - Energy and supply
  "industries-energy-and-supply-2": { folder: "Industries", name: "Energy and Supply 2" }, // was Industries - Energy and supply 2
  "industries-financial-services": { folder: "Industries", name: "Financial Services" }, // was Industries - Financial Services
  "industries-financial-services-2": { folder: "Industries", name: "Financial Services 2" }, // was Industries - Financial Services 2
  "industries-government": { folder: "Industries", name: "Government" }, // was Industries - Government
  "industries-healthcare": { folder: "Industries", name: "Healthcare" }, // was Industries - Healthcare
  "industries-healthcare-2": { folder: "Industries", name: "Healthcare 2" }, // was Industries - Healthcare 2
  "industries-insurance": { folder: "Industries", name: "Insurance" }, // was Industries - Insurance
  "industries-manufacturing": { folder: "Industries", name: "Manufacturing" }, // was Industries - Manufacturing
  "industries-manufacturing-2": { folder: "Industries", name: "Manufacturing 2" }, // was Industries - Manufacturing 2
  "industries-retail": { folder: "Industries", name: "Retail" }, // was Industries - Retail
  "industries-transporation": { folder: "Industries", name: "Transportation" }, // was Industries - Transporation
  "key-capabilities-certifications": { folder: "Security & compliance", name: "Certifications" }, // was Key Capabilities - Certifications
  "key-capabilities-certifications-2": { folder: "Security & compliance", name: "Certifications 2" }, // was Key Capabilities - Certifications 2
  "subscription-legal-assurance-and-compliance": { folder: "Security & compliance", name: "Legal Assurance and Compliance" }, // was Subscription - Legal Assurance and Compliance
  "subscription-legal-assurance-and-compliance-2": { folder: "Security & compliance", name: "Legal Assurance and Compliance 2" }, // was Subscription - Legal Assurance and Compliance 2
  "platform-premium-security": { folder: "Security & compliance", name: "Premium Security" }, // was Platform - Premium Security
  "platform-premium-security-2": { folder: "Security & compliance", name: "Premium Security 2" }, // was Platform - Premium Security 2
  "platform-premium-security-3": { folder: "Security & compliance", name: "Premium Security 3" }, // was Platform - Premium Security 3
  "platform-premium-security-4": { folder: "Security & compliance", name: "Premium Security 4" }, // was Platform - Premium Security 4
  "platform-premium-security-5": { folder: "Security & compliance", name: "Premium Security 5" }, // was Platform - Premium Security 5
  "security-security-compliance": { folder: "Security & compliance", name: "Security & Compliance" }, // was Security - Security & Compliance
  "security-security-from-the-ground-up": { folder: "Security & compliance", name: "Security from the ground up" }, // was Security - Security from the ground up
  "user-user-security": { folder: "Security & compliance", name: "User Security" }, // was User - User Security
  "user-user-security-5": { folder: "Security & compliance", name: "User Security 5" }, // was User - User Security 5
  "security-verification": { folder: "Security & compliance", name: "Verification" }, // was Security - Verification
  "security-website-security": { folder: "Security & compliance", name: "Website Security" }, // was Security - Website Security
  "safety-compliance-learning-from-incidents": { folder: "Operations", name: "Learning from Incidents" }, // was Safety & Compliance - Learning from incidents
  "commerce-notifications": { folder: "Operations", name: "Notifications" }, // was Commerce - Notifications
  "commerce-notifications-2": { folder: "Operations", name: "Notifications 2" }, // was Commerce - Notifications 2
  "general-order-management": { folder: "Operations", name: "Order Management" }, // was General - Order Management
  "safety-compliance-preventative-measurements": { folder: "Operations", name: "Preventative Measures" }, // was Safety & Compliance - Preventative measurements
  "safety-compliance-process-improvement": { folder: "Operations", name: "Process Improvement" }, // was Safety & Compliance - Process Improvement
  "safety-compliance-product-quality": { folder: "Operations", name: "Product Quality" }, // was Safety & Compliance - Product Quality
  "safety-compliance-roadmap": { folder: "Operations", name: "Roadmap" }, // was Safety & Compliance - roadmap
  "safety-compliance-scan-for-incidents": { folder: "Operations", name: "Scan for Incidents" }, // was Safety & Compliance - Scan for incidents
  "general-shipping": { folder: "Operations", name: "Shipping" }, // was General - Shipping
  "data-backup": { folder: "Data & content", name: "Backup" }, // was Data - Backup
  "content-content-management": { folder: "Data & content", name: "Content Management" }, // was Content - Content Management
  "data-dam": { folder: "Data & content", name: "DAM" }, // was Data - DAM
  "data-database": { folder: "Data & content", name: "Database" }, // was Data - Database
  "data-file-storage": { folder: "Data & content", name: "File Storage" }, // was Data - File Storage
  "general-map": { folder: "Data & content", name: "Map" }, // was General - Map
  "commerce-pim": { folder: "Data & content", name: "PIM" }, // was Commerce - PIM
  "commerce-product-catalogues-2": { folder: "Data & content", name: "Product Catalogues 2" }, // was Commerce - Product Catalogues 2
  "commerce-product-catalogues-3": { folder: "Data & content", name: "Product Catalogues 3" }, // was Commerce - Product Catalogues 3
  "commerce-product-catalogues-4": { folder: "Data & content", name: "Product Catalogues 4" }, // was Commerce - Product Catalogues 4
  "content-search": { folder: "Data & content", name: "Search" }, // was Content - Search
  "services-chatbot": { folder: "Customers & service", name: "Chatbot" }, // was Services - Chatbot
  "services-concierge2": { folder: "Customers & service", name: "Concierge 2" }, // was Services - Concierge2
  "customer-support-customer-advocacy-program": { folder: "Customers & service", name: "Customer Advocacy Program" }, // was Customer Support - Customer Advocacy Program
  "customer-support-customer-advocacy-program-2": { folder: "Customers & service", name: "Customer Advocacy Program 2" }, // was Customer Support - Customer Advocacy Program 2
  "customer-customer-loyalty": { folder: "Customers & service", name: "Customer Loyalty" }, // was Customer - Customer Loyalty
  "customer-customer-satisfaction": { folder: "Customers & service", name: "Customer Satisfaction" }, // was Customer - Customer Satisfaction
  "customer-support-global-services": { folder: "Customers & service", name: "Global Services (Customer Support)" }, // was Customer Support - Global Services
  "platform-global-services": { folder: "Customers & service", name: "Global Services (Platform)" }, // was Platform - Global Services
  "services-global-services2": { folder: "Customers & service", name: "Global Services 2" }, // was Services - Global Services2
  "general-mail": { folder: "Customers & service", name: "Mail" }, // was General - Mail
  "services-managed-services": { folder: "Customers & service", name: "Managed Services" }, // was Services - Managed Services
  "services-partnership": { folder: "Customers & service", name: "Partnership" }, // was Services - Partnership
  "customer-relationship-management": { folder: "Customers & service", name: "Relationship Management" }, // was Customer - Relationship Management
  "services-serve1": { folder: "Customers & service", name: "Serve" }, // was Services - Serve1
  "services-serve2": { folder: "Customers & service", name: "Serve 2" }, // was Services - Serve2
  "services-service": { folder: "Customers & service", name: "Service" }, // was Services - Service
  "customer-support-support": { folder: "Customers & service", name: "Support" }, // was Customer Support - Support
  "customer-support-support-2": { folder: "Customers & service", name: "Support 2" }, // was Customer Support - Support 2
  "customer-support-testimonies": { folder: "Customers & service", name: "Testimonies" }, // was Customer Support - Testimonies
  "customer-support-testimonies-2": { folder: "Customers & service", name: "Testimonies 2" }, // was Customer Support - Testimonies 2
  "customer-support-world-examples": { folder: "Customers & service", name: "World Examples" }, // was Customer Support - World examples
  "customer-support-world-examples-2": { folder: "Customers & service", name: "World Examples 2" }, // was Customer Support - World examples 2
  "performance-analytics": { folder: "Business value", name: "Analytics" }, // was Performance - Analytics
  "business-costly": { folder: "Business value", name: "Costly" }, // was Business - Costly
  "business-dashboard": { folder: "Business value", name: "Dashboard (Business)" }, // was Business - Dashboard
  "general-dashboard": { folder: "Business value", name: "Dashboard (General)" }, // was General - Dashboard
  "performance-dashboard2": { folder: "Business value", name: "Dashboard2 (Performance)" }, // was Performance - Dashboard2
  "platform-dashboard2": { folder: "Business value", name: "Dashboard2 (Platform)" }, // was Platform - Dashboard2
  "subscription-exclusive-functionality": { folder: "Business value", name: "Exclusive Functionality" }, // was Subscription - Exclusive Functionality
  "subscription-exclusive-functionality-2": { folder: "Business value", name: "Exclusive Functionality 2" }, // was Subscription - Exclusive Functionality 2
  "business-funnel": { folder: "Business value", name: "Funnel" }, // was Business - Funnel
  "general-partners": { folder: "Business value", name: "Partners" }, // was General - Partners
  "general-performance": { folder: "Business value", name: "Performance" }, // was General - Performance
  "general-personalization": { folder: "Business value", name: "Personalization" }, // was General - Personalization
  "general-pricing": { folder: "Business value", name: "Pricing (General)" }, // was General - Pricing
  "key-capabilities-pricing": { folder: "Business value", name: "Pricing (Key Capabilities)" }, // was Key Capabilities - Pricing
  "key-capabilities-pricing-2": { folder: "Business value", name: "Pricing 2" }, // was Key Capabilities - Pricing 2
  "platform-prize": { folder: "Business value", name: "Prize" }, // was Platform - Prize
  "platform-prize-2": { folder: "Business value", name: "Prize 2" }, // was Platform - Prize 2
  "business-proof-of-value": { folder: "Business value", name: "Proof of Value" }, // was Business - Proof of Value
  "business-rapid-roi": { folder: "Business value", name: "Rapid ROI" }, // was Business - Rapid ROI
  "business-self-service": { folder: "Business value", name: "Self Service" }, // was Business - Self Service
  "business-squad": { folder: "Business value", name: "Squad" }, // was Business - Squad
  "business-technical-account-management": { folder: "Business value", name: "Technical Account Management" }, // was Business - Technical Account Management
  "user-user-acquisition-cost": { folder: "Business value", name: "User Acquisition Cost" }, // was User - User Acquisition Cost
  "user-add-user": { folder: "People & learning", name: "Add User" }, // was User - Add user
  "education-courses": { folder: "People & learning", name: "Courses" }, // was Education - Courses
  "education-documentation": { folder: "People & learning", name: "Documentation" }, // was Education - Documentation
  "education-education": { folder: "People & learning", name: "Education" }, // was Education - Education
  "education-education2": { folder: "People & learning", name: "Education 2" }, // was Education - Education2
  "education-learning-paths": { folder: "People & learning", name: "Learning Paths" }, // was Education - Learning Paths
  "user-user": { folder: "People & learning", name: "User" }, // was User - User
  "user-user-validation": { folder: "People & learning", name: "User Validation" }, // was User - User Validation
  "status-check": { folder: "Status & tips", name: "Check" }, // was Status - Check
  "status-error": { folder: "Status & tips", name: "Error" }, // was Status - Error
  "tips-tip-11": { folder: "Status & tips", name: "Tip 11" }, // was Tips - Tip 11
  "tips-tip-12": { folder: "Status & tips", name: "Tip 12" }, // was Tips - Tip 12
  "tips-tip-13": { folder: "Status & tips", name: "Tip 13" }, // was Tips - Tip 13
  "tips-tip-14": { folder: "Status & tips", name: "Tip 14" }, // was Tips - Tip 14
  "status-update": { folder: "Status & tips", name: "Update" }, // was Status - Update
};
