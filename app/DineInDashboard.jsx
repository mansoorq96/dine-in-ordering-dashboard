import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import Papa from 'papaparse';

const isWeekend = (dateStr) => {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
};

const COLORS = {
  waiter: '#059669',
  api: '#6366F1',
  weekend: '#FCD34D',
  weekday: '#94A3B8',
  bg: '#0F172A',
  card: '#1E293B',
  cardHover: '#334155',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  border: '#334155',
  accent: '#38BDF8',
  danger: '#EF4444',
  success: '#10B981'
};

// Hover tooltip component - shows immediately on hover
const InfoTooltip = ({ text, children }) => {
  const [show, setShow] = useState(false);
  return (
    <span 
      style={{ position: 'relative', cursor: 'help', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: 8,
          padding: '8px 12px',
          background: '#0F172A',
          border: '1px solid #475569',
          borderRadius: 6,
          fontSize: 11,
          color: '#E2E8F0',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          minWidth: 200,
          maxWidth: 300,
          whiteSpace: 'normal',
          textAlign: 'left',
          lineHeight: 1.4,
        }}>
          {text}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            border: '6px solid transparent',
            borderTopColor: '#475569',
          }} />
        </div>
      )}
    </span>
  );
};

export default function DineInDashboard() {
  const [rawData, setRawData] = useState(null);
  const [dayFilter, setDayFilter] = useState('all');
  const [selectedKitchens, setSelectedKitchens] = useState(['all']);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [fileName, setFileName] = useState('');
  const [showAYCE, setShowAYCE] = useState(true);
  const [selectedItemTypes, setSelectedItemTypes] = useState(['all']);
  const [minMainsFilter, setMinMainsFilter] = useState(1);
  const [savedFiles, setSavedFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadingFromCloud, setLoadingFromCloud] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(['all']);
  const [saveToCloud, setSaveToCloud] = useState(true);
  const fileInputRef = useRef(null);

  // Extract unique categories from data
  const allCategories = useMemo(() => {
    if (!rawData) return [];
    const categories = new Set();
    rawData.forEach(row => {
      const cat = row.CATEGORY_NAME;
      if (cat) categories.add(cat);
    });
    return Array.from(categories).sort();
  }, [rawData]);

  const toggleCategory = (category) => {
    if (category === 'all') {
      setSelectedCategories(['all']);
    } else {
      let newSelection = selectedCategories.filter(c => c !== 'all');
      if (newSelection.includes(category)) {
        newSelection = newSelection.filter(c => c !== category);
      } else {
        newSelection.push(category);
      }
      if (newSelection.length === 0) {
        setSelectedCategories(['all']);
      } else {
        setSelectedCategories(newSelection);
      }
    }
  };

  // Fetch saved files on mount
  useEffect(() => {
    fetchSavedFiles();
  }, []);

  const fetchSavedFiles = async () => {
    try {
      setLoadingFiles(true);
      const res = await fetch('/api/files/list');
      const data = await res.json();
      setSavedFiles(data.files || []);
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const loadFileFromUrl = async (url, filename) => {
    try {
      setLoadingFromCloud(true);
      const res = await fetch(url);
      const text = await res.text();
      
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setRawData(results.data);
          setFileName(filename);
          setDateRange({ start: '', end: '' });
          setSelectedKitchens(['all']);
          setLoadingFromCloud(false);
        },
        error: (err) => {
          console.error('Parse error:', err);
          setLoadingFromCloud(false);
        }
      });
    } catch (err) {
      console.error('Error loading file:', err);
      setLoadingFromCloud(false);
    }
  };

  const uploadAndSaveFile = async (file) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      if (data.success) {
        // Refresh file list
        await fetchSavedFiles();
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  // Extract all unique kitchens
  const allKitchens = useMemo(() => {
    if (!rawData) return [];
    const kitchens = new Set();
    rawData.forEach(row => {
      const kitchen = row.KITCHEN_NAME_CLEAN || row.DIM_KITCHEN_NAME;
      if (kitchen) kitchens.add(kitchen);
    });
    return Array.from(kitchens).sort();
  }, [rawData]);

  // Extract all unique item types
  const allItemTypes = useMemo(() => {
    if (!rawData) return [];
    const types = new Set();
    rawData.forEach(row => {
      const itemType = row.ITEM_ADDON_FLG;
      if (itemType && itemType.trim() && (itemType === 'COMBO_ITEM' || itemType === 'COMBO_ADDON')) {
        types.add(itemType);
      }
    });
    return Array.from(types).sort();
  }, [rawData]);

  const processedData = useMemo(() => {
    if (!rawData) return null;

    // Detect file format based on columns
    const isItemLevel = rawData[0]?.hasOwnProperty('ORDER_TOTAL_LCY') || rawData[0]?.hasOwnProperty('O_PRICE_FINAL_BILL');
    
    // First pass: identify which orders to include based on filters
    const orderItemCounts = {}; // Track if order has items matching category filter
    const ayceOrderIds = new Set();
    
    if (isItemLevel) {
      rawData.forEach(row => {
        const orderId = row.ORDER_ID;
        if (!orderId) return;
        
        const itemName = row.ITEM_NAME_CLEAN || row.ITEM_NAME || '';
        const categoryName = row.CATEGORY_NAME || '';
        const isAYCE = itemName.includes('AYCE') || categoryName.includes('AYCE');
        
        // Track AYCE orders
        if (isAYCE) {
          ayceOrderIds.add(orderId);
        }
        
        // Track if order has items matching category filter
        if (!orderItemCounts[orderId]) {
          orderItemCounts[orderId] = { hasMatchingCategory: false };
        }
        
        // Check if this item matches category filter
        if (selectedCategories.includes('all') || selectedCategories.includes(categoryName)) {
          // Also check AYCE filter for this item
          if (showAYCE || !isAYCE) {
            orderItemCounts[orderId].hasMatchingCategory = true;
          }
        }
      });
    }
    
    // Aggregate to order level
    const orderMap = {};
    rawData.forEach(row => {
      const orderId = row.ORDER_ID;
      if (!orderId) return;
      
      // Skip AYCE orders if filter is set to hide
      if (!showAYCE && ayceOrderIds.has(orderId)) return;
      
      // Skip orders that don't have items matching category filter (for item-level data)
      if (isItemLevel && !selectedCategories.includes('all')) {
        if (!orderItemCounts[orderId]?.hasMatchingCategory) return;
      }
      
      if (!orderMap[orderId]) {
        // Use ORDER_TOTAL_LCY as the primary order total
        let bill;
        if (row.ORDER_TOTAL_LCY !== undefined) {
          bill = parseFloat(row.ORDER_TOTAL_LCY || 0);
        } else if (isItemLevel) {
          // Fallback: O_PRICE_FINAL_BILL + WALLET_PAYMENT_AMOUNT
          const finalBill = parseFloat(row.O_PRICE_FINAL_BILL || 0);
          const wallet = parseFloat(row.WALLET_PAYMENT_AMOUNT || 0);
          bill = finalBill + wallet;
        } else {
          // Order-level fallback: use TOTAL_PARTED_BILL_AMOUNT directly
          bill = parseFloat(row.TOTAL_PARTED_BILL_AMOUNT || 0);
        }
        
        const kitchen = row.KITCHEN_NAME_CLEAN || row.DIM_KITCHEN_NAME || 'Unknown';
        
        orderMap[orderId] = {
          orderId,
          date: row.ORDER_CREATED_AT?.substring(0, 10),
          kitchen,
          createdBy: row.CREATED_BY_FULL_NAME,
          bill
        };
      }
    });

    const orders = Object.values(orderMap);
    const dailyMap = {};
    const kitchenMap = {};

    orders.forEach(order => {
      const dateStr = order.date;
      if (!dateStr) return;

      const kitchen = order.kitchen;
      const isAPI = order.createdBy === 'DINE IN API';
      const bill = order.bill;

      // Determine order value bin (bins of 50)
      const valueBinIndex = Math.min(Math.floor(bill / 50), 8);

      // Daily aggregation
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = {
          date: dateStr,
          waiterBill: 0, waiterOrders: 0,
          apiBill: 0, apiOrders: 0,
          waiterValueBins: [0, 0, 0, 0, 0, 0, 0, 0, 0],
          apiValueBins: [0, 0, 0, 0, 0, 0, 0, 0, 0],
          waiterOrderValues: [],
          apiOrderValues: [],
          kitchens: {}
        };
      }

      const day = dailyMap[dateStr];

      // Initialize kitchen in daily data
      if (!day.kitchens[kitchen]) {
        day.kitchens[kitchen] = {
          waiterBill: 0, waiterOrders: 0,
          apiBill: 0, apiOrders: 0,
          waiterOrderValues: [],
          apiOrderValues: []
        };
      }

      // Kitchen-level aggregation
      if (!kitchenMap[kitchen]) {
        kitchenMap[kitchen] = {
          name: kitchen,
          waiterBill: 0, waiterOrders: 0,
          apiBill: 0, apiOrders: 0
        };
      }

      if (isAPI) {
        day.apiBill += bill;
        day.apiOrders += 1;
        day.apiValueBins[valueBinIndex] += 1;
        day.apiOrderValues.push(bill);
        
        day.kitchens[kitchen].apiBill += bill;
        day.kitchens[kitchen].apiOrders += 1;
        day.kitchens[kitchen].apiOrderValues.push(bill);

        kitchenMap[kitchen].apiBill += bill;
        kitchenMap[kitchen].apiOrders += 1;
      } else {
        day.waiterBill += bill;
        day.waiterOrders += 1;
        day.waiterValueBins[valueBinIndex] += 1;
        day.waiterOrderValues.push(bill);

        day.kitchens[kitchen].waiterBill += bill;
        day.kitchens[kitchen].waiterOrders += 1;
        day.kitchens[kitchen].waiterOrderValues.push(bill);

        kitchenMap[kitchen].waiterBill += bill;
        kitchenMap[kitchen].waiterOrders += 1;
      }
    });

    const sorted = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    
    sorted.forEach(d => {
      d.waiterAOV = d.waiterOrders > 0 ? d.waiterBill / d.waiterOrders : 0;
      d.apiAOV = d.apiOrders > 0 ? d.apiBill / d.apiOrders : 0;
    });

    return { daily: sorted, kitchens: kitchenMap };
  }, [rawData, showAYCE, selectedCategories]);

  const dateExtent = useMemo(() => {
    if (!processedData || processedData.daily.length === 0) return { min: '', max: '' };
    return {
      min: processedData.daily[0].date,
      max: processedData.daily[processedData.daily.length - 1].date
    };
  }, [processedData]);

  const filteredData = useMemo(() => {
    if (!processedData) return [];
    
    return processedData.daily.filter(d => {
      const startOk = !dateRange.start || d.date >= dateRange.start;
      const endOk = !dateRange.end || d.date <= dateRange.end;
      if (!startOk || !endOk) return false;

      if (dayFilter === 'weekend') return isWeekend(d.date);
      if (dayFilter === 'weekday') return !isWeekend(d.date);
      return true;
    }).map(d => {
      // Apply kitchen filter
      if (selectedKitchens.includes('all')) return d;

      const filtered = {
        ...d,
        waiterBill: 0, waiterOrders: 0,
        apiBill: 0, apiOrders: 0,
        waiterValueBins: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        apiValueBins: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        waiterOrderValues: [],
        apiOrderValues: []
      };

      selectedKitchens.forEach(kitchen => {
        if (d.kitchens[kitchen]) {
          const k = d.kitchens[kitchen];
          filtered.waiterBill += k.waiterBill;
          filtered.waiterOrders += k.waiterOrders;
          filtered.apiBill += k.apiBill;
          filtered.apiOrders += k.apiOrders;

          // Collect order values from selected kitchens
          if (k.waiterOrderValues) {
            filtered.waiterOrderValues.push(...k.waiterOrderValues);
          }
          if (k.apiOrderValues) {
            filtered.apiOrderValues.push(...k.apiOrderValues);
          }
        }
      });

      // Recalculate value bins for filtered kitchens
      filtered.waiterOrderValues.forEach(bill => {
        const binIndex = Math.min(Math.floor(bill / 50), 8);
        filtered.waiterValueBins[binIndex] += 1;
      });
      filtered.apiOrderValues.forEach(bill => {
        const binIndex = Math.min(Math.floor(bill / 50), 8);
        filtered.apiValueBins[binIndex] += 1;
      });

      filtered.waiterAOV = filtered.waiterOrders > 0 ? filtered.waiterBill / filtered.waiterOrders : 0;
      filtered.apiAOV = filtered.apiOrders > 0 ? filtered.apiBill / filtered.apiOrders : 0;

      return filtered;
    });
  }, [processedData, dayFilter, dateRange, selectedKitchens]);

  const pieData = useMemo(() => {
    if (!filteredData.length) return [];
    const waiterTotal = filteredData.reduce((sum, d) => sum + d.waiterOrders, 0);
    const apiTotal = filteredData.reduce((sum, d) => sum + d.apiOrders, 0);
    return [
      { name: 'Waiter', value: waiterTotal, color: COLORS.waiter },
      { name: 'Self-Order', value: apiTotal, color: COLORS.api }
    ];
  }, [filteredData]);

  // Order Value Bins (bins of 50 AED)
  const orderValueBinsData = useMemo(() => {
    const binLabels = ['0-50', '50-100', '100-150', '150-200', '200-250', '250-300', '300-350', '350-400', '400+'];
    const bins = binLabels.map(label => ({ label, waiter: 0, api: 0 }));

    filteredData.forEach(d => {
      if (d.waiterValueBins) {
        d.waiterValueBins.forEach((count, i) => {
          bins[i].waiter += count;
        });
      }
      if (d.apiValueBins) {
        d.apiValueBins.forEach((count, i) => {
          bins[i].api += count;
        });
      }
    });

    return bins;
  }, [filteredData]);

  const aovData = useMemo(() => {
    return filteredData.map(d => ({
      date: d.date,
      waiterAOV: d.waiterAOV,
      apiAOV: d.apiAOV,
      isWeekend: isWeekend(d.date)
    }));
  }, [filteredData]);

  // Overall AOV for selected period
  const overallAOV = useMemo(() => {
    let waiterBill = 0, waiterOrders = 0, apiBill = 0, apiOrders = 0;
    let waiterOrderValues = [];
    let apiOrderValues = [];
    
    filteredData.forEach(d => {
      waiterBill += d.waiterBill;
      waiterOrders += d.waiterOrders;
      apiBill += d.apiBill;
      apiOrders += d.apiOrders;
      
      if (d.waiterOrderValues) {
        waiterOrderValues.push(...d.waiterOrderValues);
      }
      if (d.apiOrderValues) {
        apiOrderValues.push(...d.apiOrderValues);
      }
    });

    // Calculate median
    const getMedian = (values) => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    return {
      waiterAOV: waiterOrders > 0 ? waiterBill / waiterOrders : 0,
      apiAOV: apiOrders > 0 ? apiBill / apiOrders : 0,
      waiterMedian: getMedian(waiterOrderValues),
      apiMedian: getMedian(apiOrderValues),
      waiterOrders,
      apiOrders,
      waiterBill,
      apiBill
    };
  }, [filteredData]);

  // AOV per Kitchen
  const kitchenAOVData = useMemo(() => {
    if (!processedData || !filteredData.length) return [];

    const kitchenStats = {};

    filteredData.forEach(d => {
      Object.entries(d.kitchens || {}).forEach(([kitchen, data]) => {
        if (!selectedKitchens.includes('all') && !selectedKitchens.includes(kitchen)) return;

        if (!kitchenStats[kitchen]) {
          kitchenStats[kitchen] = {
            name: kitchen,
            waiterBill: 0, waiterOrders: 0,
            apiBill: 0, apiOrders: 0
          };
        }
        kitchenStats[kitchen].waiterBill += data.waiterBill;
        kitchenStats[kitchen].waiterOrders += data.waiterOrders;
        kitchenStats[kitchen].apiBill += data.apiBill;
        kitchenStats[kitchen].apiOrders += data.apiOrders;
      });
    });

    return Object.values(kitchenStats)
      .map(k => ({
        name: k.name,
        fullName: k.name,
        waiterAOV: k.waiterOrders > 0 ? k.waiterBill / k.waiterOrders : 0,
        apiAOV: k.apiOrders > 0 ? k.apiBill / k.apiOrders : 0,
        waiterOrders: k.waiterOrders,
        apiOrders: k.apiOrders,
        totalOrders: k.waiterOrders + k.apiOrders,
        adoptionRate: (k.waiterOrders + k.apiOrders) > 0 
          ? (k.apiOrders / (k.waiterOrders + k.apiOrders) * 100) 
          : 0
      }))
      .filter(k => k.waiterOrders > 0 || k.apiOrders > 0)
      .sort((a, b) => (b.waiterOrders + b.apiOrders) - (a.waiterOrders + a.apiOrders));
  }, [processedData, filteredData, selectedKitchens]);

  // AOV by Location Category with Kitchen grouping - separated by channel
  const locationCategoryAOV = useMemo(() => {
    if (!rawData || !processedData) return [];
    
    // Detect file format
    const isItemLevel = rawData[0]?.hasOwnProperty('ORDER_TOTAL_LCY') || rawData[0]?.hasOwnProperty('O_PRICE_FINAL_BILL');
    
    // First pass: identify AYCE orders and category matches (for item-level data)
    const ayceOrderIds = new Set();
    const orderItemCounts = {};
    
    if (isItemLevel) {
      rawData.forEach(row => {
        const orderId = row.ORDER_ID;
        if (!orderId) return;
        
        const itemName = row.ITEM_NAME_CLEAN || row.ITEM_NAME || '';
        const categoryName = row.CATEGORY_NAME || '';
        const isAYCE = itemName.includes('AYCE') || categoryName.includes('AYCE');
        
        // Track AYCE orders
        if (isAYCE) {
          ayceOrderIds.add(orderId);
        }
        
        // Track if order has items matching category filter
        if (!orderItemCounts[orderId]) {
          orderItemCounts[orderId] = { hasMatchingCategory: false };
        }
        
        // Check if this item matches category filter
        if (selectedCategories.includes('all') || selectedCategories.includes(categoryName)) {
          // Also check AYCE filter for this item
          if (showAYCE || !isAYCE) {
            orderItemCounts[orderId].hasMatchingCategory = true;
          }
        }
      });
    }
    
    // Build order map with filters applied
    const orderMap = {};
    
    rawData.forEach(row => {
      const orderId = row.ORDER_ID;
      if (!orderId) return;
      
      // Apply AYCE filter
      if (!showAYCE && ayceOrderIds.has(orderId)) return;
      
      // Apply category filter (for item-level data)
      if (isItemLevel && !selectedCategories.includes('all')) {
        if (!orderItemCounts[orderId]?.hasMatchingCategory) return;
      }
      
      if (!orderMap[orderId]) {
        const orderDate = row.ORDER_CREATED_AT?.substring(0, 10);
        const locationCategory = row.LOCATION_CATEGORY || 'UNCATEGORIZED';
        const kitchenName = row.KITCHEN_NAME_CLEAN || row.KITCHEN_NAME || row.DIM_KITCHEN_NAME || 'Unknown Kitchen';
        const kitchenId = row.FK_SKOS_KITCHEN_ID || kitchenName;
        const createdBy = row.CREATED_BY_FULL_NAME || '';
        const isAPI = createdBy === 'DINE IN API';
        
        // Use ORDER_TOTAL_LCY as primary, with fallbacks
        let orderValue;
        if (row.ORDER_TOTAL_LCY !== undefined) {
          orderValue = parseFloat(row.ORDER_TOTAL_LCY || 0);
        } else if (row.O_PRICE_FINAL_BILL !== undefined) {
          // Fallback: O_PRICE_FINAL_BILL + WALLET_PAYMENT_AMOUNT
          const finalBill = parseFloat(row.O_PRICE_FINAL_BILL || 0);
          const wallet = parseFloat(row.WALLET_PAYMENT_AMOUNT || 0);
          orderValue = finalBill + wallet;
        } else if (row.SUBTOTAL_USD !== undefined) {
          // Order-level format fallback
          const subtotal = parseFloat(row.SUBTOTAL_USD || 0);
          const tax = parseFloat(row.TAX_AMOUNT_USD || 0);
          orderValue = subtotal + tax;
        } else {
          orderValue = 0;
        }
        
        orderMap[orderId] = {
          date: orderDate,
          locationCategory,
          kitchenId,
          kitchenName,
          orderValue,
          isAPI
        };
      }
    });
    
    // Apply date range and day filters
    const filteredOrders = Object.values(orderMap).filter(order => {
      const dateStr = order.date;
      if (!dateStr) return false;
      
      // Date range filter
      const startOk = !dateRange.start || dateStr >= dateRange.start;
      const endOk = !dateRange.end || dateStr <= dateRange.end;
      if (!startOk || !endOk) return false;
      
      // Day filter (weekend/weekday)
      if (dayFilter === 'weekend' && !isWeekend(dateStr)) return false;
      if (dayFilter === 'weekday' && isWeekend(dateStr)) return false;
      
      // Kitchen filter
      if (!selectedKitchens.includes('all') && !selectedKitchens.includes(order.kitchenName)) return false;
      
      return true;
    });
    
    // Now aggregate by category and kitchen, separated by channel
    const categoryMap = {};
    
    filteredOrders.forEach(order => {
      const { locationCategory, kitchenId, kitchenName, orderValue, isAPI } = order;
      
      if (orderValue <= 0) return;
      
      // Initialize category if not exists
      if (!categoryMap[locationCategory]) {
        categoryMap[locationCategory] = {
          category: locationCategory,
          waiterTotalValue: 0,
          waiterOrderCount: 0,
          apiTotalValue: 0,
          apiOrderCount: 0,
          kitchens: {}
        };
      }
      
      // Add to category totals by channel
      if (isAPI) {
        categoryMap[locationCategory].apiTotalValue += orderValue;
        categoryMap[locationCategory].apiOrderCount += 1;
      } else {
        categoryMap[locationCategory].waiterTotalValue += orderValue;
        categoryMap[locationCategory].waiterOrderCount += 1;
      }
      
      // Track kitchen within category by channel
      if (!categoryMap[locationCategory].kitchens[kitchenId]) {
        categoryMap[locationCategory].kitchens[kitchenId] = {
          name: kitchenName,
          waiterTotalValue: 0,
          waiterOrderCount: 0,
          apiTotalValue: 0,
          apiOrderCount: 0
        };
      }
      
      if (isAPI) {
        categoryMap[locationCategory].kitchens[kitchenId].apiTotalValue += orderValue;
        categoryMap[locationCategory].kitchens[kitchenId].apiOrderCount += 1;
      } else {
        categoryMap[locationCategory].kitchens[kitchenId].waiterTotalValue += orderValue;
        categoryMap[locationCategory].kitchens[kitchenId].waiterOrderCount += 1;
      }
    });
    
    // Calculate AOV for each category and kitchen by channel
    const result = Object.values(categoryMap).map(cat => {
      const waiterAOV = cat.waiterOrderCount > 0 ? cat.waiterTotalValue / cat.waiterOrderCount : 0;
      const apiAOV = cat.apiOrderCount > 0 ? cat.apiTotalValue / cat.apiOrderCount : 0;
      const totalOrders = cat.waiterOrderCount + cat.apiOrderCount;
      
      const kitchenData = Object.entries(cat.kitchens).map(([id, kitchen]) => ({
        id,
        name: kitchen.name,
        waiterAOV: kitchen.waiterOrderCount > 0 ? kitchen.waiterTotalValue / kitchen.waiterOrderCount : 0,
        apiAOV: kitchen.apiOrderCount > 0 ? kitchen.apiTotalValue / kitchen.apiOrderCount : 0,
        waiterOrderCount: kitchen.waiterOrderCount,
        apiOrderCount: kitchen.apiOrderCount,
        totalOrders: kitchen.waiterOrderCount + kitchen.apiOrderCount,
        waiterTotalValue: kitchen.waiterTotalValue,
        apiTotalValue: kitchen.apiTotalValue
      })).sort((a, b) => b.totalOrders - a.totalOrders);
      
      return {
        category: cat.category,
        waiterAOV,
        apiAOV,
        waiterOrderCount: cat.waiterOrderCount,
        apiOrderCount: cat.apiOrderCount,
        totalOrders,
        waiterTotalValue: cat.waiterTotalValue,
        apiTotalValue: cat.apiTotalValue,
        kitchens: kitchenData,
        kitchenCount: kitchenData.length
      };
    }).sort((a, b) => b.totalOrders - a.totalOrders);
    
    return result;
  }, [rawData, processedData, showAYCE, selectedCategories, dateRange, dayFilter, selectedKitchens]);

  // Item-level analytics (only works with item-level data)
  const itemAnalytics = useMemo(() => {
    if (!rawData) return { itemSales: [], itemRevenue: [], itemTypeCount: [], comboSales: [], comboRevenue: [] };

    // Check if this is item-level data
    const isItemLevel = rawData[0]?.hasOwnProperty('ORDER_TOTAL_LCY') || rawData[0]?.hasOwnProperty('O_PRICE_FINAL_BILL');
    if (!isItemLevel) {
      // Return empty for order-level data (no item details available)
      return { itemSales: [], itemRevenue: [], itemTypeCount: [], comboSales: [], comboRevenue: [] };
    }

    const itemStats = {};
    const itemTypeStats = {};
    const comboStats = {};

    rawData.forEach(row => {
      const dateStr = row.ORDER_CREATED_AT?.substring(0, 10);
      if (!dateStr) return;

      // Apply date filter
      if (dateRange.start && dateStr < dateRange.start) return;
      if (dateRange.end && dateStr > dateRange.end) return;

      // Apply day type filter
      if (dayFilter === 'weekend' && !isWeekend(dateStr)) return;
      if (dayFilter === 'weekday' && isWeekend(dateStr)) return;

      // Apply kitchen filter
      const kitchen = row.KITCHEN_NAME_CLEAN || row.DIM_KITCHEN_NAME;
      if (!selectedKitchens.includes('all') && !selectedKitchens.includes(kitchen)) return;

      // Apply category filter
      const category = row.CATEGORY_NAME || '';
      if (!selectedCategories.includes('all') && !selectedCategories.includes(category)) return;

      const itemName = row.ITEM_NAME_CLEAN || row.ITEM_NAME || 'Unknown';
      const comboName = row.COMBO_NAME || row.POSITION_NAME_CLEAN || row.ITEM_NAME_CLEAN || 'Unknown';
      const itemType = row.ITEM_ADDON_FLG || 'OTHER';
      const quantity = parseInt(row.ITEM_QUANTITY) || 1;
      const positionQuantity = parseInt(row.POSITION_QUANTITY) || parseInt(row.ITEM_QUANTITY) || 1;
      
      // For addons: use I_MENU_PRICE_B_TAX (actual addon price)
      // For items: use COMBO_PRICE_NET (the item's combo price)
      // Note: P_MENU_PRICE_B_TAX is the parent position price, NOT the addon price
      const hasAddonPricing = row.hasOwnProperty('I_MENU_PRICE_B_TAX');
      let itemPrice = 0;
      if (itemType === 'COMBO_ADDON') {
        itemPrice = hasAddonPricing ? (parseFloat(row.I_MENU_PRICE_B_TAX) || 0) : 0;
      } else {
        itemPrice = parseFloat(row.I_MENU_PRICE_B_TAX) || parseFloat(row.COMBO_PRICE_NET) || 0;
      }
      const comboPrice = parseFloat(row.COMBO_PRICE_NET) || 0;
      const isAYCE = itemName.includes('AYCE') || (row.CATEGORY_NAME && row.CATEGORY_NAME.includes('AYCE'));
      const isComboAYCE = comboName.includes('AYCE') || (row.CATEGORY_NAME && row.CATEGORY_NAME.includes('AYCE'));

      // Apply AYCE filter
      if (!showAYCE && isAYCE) return;

      // Apply item type filter
      const normalizedType = (itemType === 'COMBO_ITEM' || itemType === 'COMBO_ADDON') ? itemType : 'OTHER';
      if (!selectedItemTypes.includes('all') && !selectedItemTypes.includes(normalizedType)) return;

      // Item stats
      if (!itemStats[itemName]) {
        itemStats[itemName] = { name: itemName, count: 0, revenue: 0, price: itemPrice, isAYCE };
      }
      itemStats[itemName].count += quantity;
      itemStats[itemName].revenue += itemPrice * quantity;
      if (itemPrice > 0) itemStats[itemName].price = itemPrice;

      // Item type stats
      if (!itemTypeStats[normalizedType]) {
        itemTypeStats[normalizedType] = { type: normalizedType, count: 0, revenue: 0 };
      }
      itemTypeStats[normalizedType].count += quantity;
      itemTypeStats[normalizedType].revenue += itemPrice * quantity;

      // Combo stats (only count once per position, use COMBO_ITEM to avoid duplicates)
      if (itemType === 'COMBO_ITEM' && comboName && comboName !== 'Unknown') {
        const comboKey = comboName;
        if (!comboStats[comboKey]) {
          comboStats[comboKey] = { name: comboName, count: 0, revenue: 0, price: comboPrice, isAYCE: isComboAYCE };
        }
        comboStats[comboKey].count += positionQuantity;
        comboStats[comboKey].revenue += comboPrice * positionQuantity;
        if (comboPrice > 0) comboStats[comboKey].price = comboPrice;
      }
    });

    const itemSales = Object.values(itemStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    const itemRevenue = Object.values(itemStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 30);

    const itemTypeCount = Object.values(itemTypeStats)
      .sort((a, b) => b.count - a.count);

    const comboSales = Object.values(comboStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    const comboRevenue = Object.values(comboStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 30);

    return { itemSales, itemRevenue, itemTypeCount, comboSales, comboRevenue };
  }, [rawData, dateRange, dayFilter, selectedKitchens, selectedCategories, showAYCE, selectedItemTypes]);

  // Category analysis with groupings
  const categoryAnalytics = useMemo(() => {
    if (!rawData) return null;

    const isItemLevel = rawData[0]?.hasOwnProperty('ORDER_TOTAL_LCY') || rawData[0]?.hasOwnProperty('O_PRICE_FINAL_BILL');
    if (!isItemLevel) return null;

    // Category groupings
    const getCategoryGroup = (category) => {
      const cat = (category || '').toLowerCase();
      
      // Drinks
      if (cat.includes('coffee') || cat.includes('tea') || cat.includes('juice') || 
          cat.includes('smoothie') || cat.includes('mocktail') || cat.includes('drinks') ||
          cat.includes('fresh juices')) {
        return 'Drinks';
      }
      // Desserts
      if (cat.includes('dessert') || cat.includes('pastry') || cat.includes('cake') ||
          cat.includes('viennoserie')) {
        return 'Desserts';
      }
      // Starters & Sides
      if (cat.includes('starter') || cat.includes('soup') || cat.includes('appetizer') || 
          cat.includes('sides') || cat.includes('fries')) {
        return 'Starters & Sides';
      }
      // Kids
      if (cat.includes('kids') || cat.includes('kid\'s')) {
        return 'Kids';
      }
      // AYCE
      if (cat.includes('ayce') || cat.includes('all-you-can')) {
        return 'AYCE';
      }
      // Add-ons (track separately)
      if (cat.includes('add-on') || cat.includes('addon') || cat.includes('add on')) {
        return 'Add-ons';
      }
      // Mains (sandwiches, salads, bowls, breakfast, combos, fit fuel)
      if (cat.includes('breakfast') || cat.includes('main') || cat.includes('sandwich') || 
          cat.includes('salad') || cat.includes('bowl') || cat.includes('burger') ||
          cat.includes('fit fuel') || cat.includes('combo') || cat.includes('special')) {
        return 'Mains';
      }
      return 'Other';
    };

    const categoryStats = {};
    const groupStats = {};
    const hasAddonPricing = rawData[0]?.hasOwnProperty('I_MENU_PRICE_B_TAX');
    
    // Track orders and mains per order for table size estimation
    const orderDetails = {};

    rawData.forEach(row => {
      const dateStr = row.ORDER_CREATED_AT?.substring(0, 10);
      if (!dateStr) return;
      if (dateRange.start && dateStr < dateRange.start) return;
      if (dateRange.end && dateStr > dateRange.end) return;
      if (dayFilter === 'weekend' && !isWeekend(dateStr)) return;
      if (dayFilter === 'weekday' && isWeekend(dateStr)) return;
      const kitchen = row.KITCHEN_NAME_CLEAN || row.DIM_KITCHEN_NAME;
      if (!selectedKitchens.includes('all') && !selectedKitchens.includes(kitchen)) return;
      
      // Apply category filter
      const category = row.CATEGORY_NAME || 'Unknown';
      if (!selectedCategories.includes('all') && !selectedCategories.includes(category)) return;

      // Apply AYCE filter
      const itemName = row.ITEM_NAME_CLEAN || row.ITEM_NAME || '';
      const isAYCE = itemName.includes('AYCE') || (category && category.includes('AYCE'));
      if (!showAYCE && isAYCE) return;

      const orderId = row.ORDER_ID;
      const group = getCategoryGroup(category);
      const isAPI = row.CREATED_BY_FULL_NAME === 'DINE IN API';
      const quantity = parseInt(row.ITEM_QUANTITY) || 1;
      const itemType = row.ITEM_ADDON_FLG || 'OTHER';
      
      // Get price based on item type
      let price = 0;
      if (itemType === 'COMBO_ADDON') {
        price = hasAddonPricing ? (parseFloat(row.I_MENU_PRICE_B_TAX) || 0) : 0;
      } else {
        price = parseFloat(row.I_MENU_PRICE_B_TAX) || parseFloat(row.COMBO_PRICE_NET) || 0;
      }

      // Track order details for per-order metrics
      if (orderId && !orderDetails[orderId]) {
        orderDetails[orderId] = {
          channel: isAPI ? 'api' : 'waiter',
          mains: 0,
          drinks: 0,
          sides: 0,
          desserts: 0,
          kids: 0,
          total: 0
        };
      }
      if (orderId && itemType === 'COMBO_ITEM') {
        orderDetails[orderId].total += quantity;
        if (group === 'Mains') orderDetails[orderId].mains += quantity;
        if (group === 'Drinks') orderDetails[orderId].drinks += quantity;
        if (group === 'Starters & Sides') orderDetails[orderId].sides += quantity;
        if (group === 'Desserts') orderDetails[orderId].desserts += quantity;
        if (group === 'Kids') orderDetails[orderId].kids += quantity;
      }

      // Category stats
      if (!categoryStats[category]) {
        categoryStats[category] = { 
          name: category, 
          group,
          waiterCount: 0, apiCount: 0, 
          waiterRevenue: 0, apiRevenue: 0 
        };
      }
      if (isAPI) {
        categoryStats[category].apiCount += quantity;
        categoryStats[category].apiRevenue += price * quantity;
      } else {
        categoryStats[category].waiterCount += quantity;
        categoryStats[category].waiterRevenue += price * quantity;
      }

      // Group stats
      if (!groupStats[group]) {
        groupStats[group] = { 
          name: group, 
          waiterCount: 0, apiCount: 0, 
          waiterRevenue: 0, apiRevenue: 0 
        };
      }
      if (isAPI) {
        groupStats[group].apiCount += quantity;
        groupStats[group].apiRevenue += price * quantity;
      } else {
        groupStats[group].waiterCount += quantity;
        groupStats[group].waiterRevenue += price * quantity;
      }
    });

    // Calculate percentages and sort
    const categoryList = Object.values(categoryStats)
      .map(c => ({
        ...c,
        total: c.waiterCount + c.apiCount,
        totalRevenue: c.waiterRevenue + c.apiRevenue,
        apiPercent: (c.waiterCount + c.apiCount) > 0 
          ? (c.apiCount / (c.waiterCount + c.apiCount) * 100) 
          : 0
      }))
      .sort((a, b) => b.total - a.total);

    // Count unique orders per channel for per-order averages
    const orderCounts = { waiter: new Set(), api: new Set() };
    rawData.forEach(row => {
      const orderId = row.ORDER_ID;
      if (!orderId) return;
      const dateStr = row.ORDER_CREATED_AT?.substring(0, 10);
      if (!dateStr) return;
      if (dateRange.start && dateStr < dateRange.start) return;
      if (dateRange.end && dateStr > dateRange.end) return;
      if (dayFilter === 'weekend' && !isWeekend(dateStr)) return;
      if (dayFilter === 'weekday' && isWeekend(dateStr)) return;
      const kitchen = row.KITCHEN_NAME_CLEAN || row.DIM_KITCHEN_NAME;
      if (!selectedKitchens.includes('all') && !selectedKitchens.includes(kitchen)) return;
      
      const isAPI = row.CREATED_BY_FULL_NAME === 'DINE IN API';
      if (isAPI) {
        orderCounts.api.add(orderId);
      } else {
        orderCounts.waiter.add(orderId);
      }
    });
    
    const waiterOrderCount = orderCounts.waiter.size;
    const apiOrderCount = orderCounts.api.size;
    const totalOrderCount = waiterOrderCount + apiOrderCount;

    // Calculate total items for percentage
    const totalWaiterItems = Object.values(groupStats).reduce((sum, g) => sum + g.waiterCount, 0);
    const totalApiItems = Object.values(groupStats).reduce((sum, g) => sum + g.apiCount, 0);

    const groupList = Object.values(groupStats)
      .map(g => ({
        ...g,
        total: g.waiterCount + g.apiCount,
        totalRevenue: g.waiterRevenue + g.apiRevenue,
        apiPercent: (g.waiterCount + g.apiCount) > 0 
          ? (g.apiCount / (g.waiterCount + g.apiCount) * 100) 
          : 0,
        // Average per order
        waiterAvgPerOrder: waiterOrderCount > 0 ? g.waiterCount / waiterOrderCount : 0,
        apiAvgPerOrder: apiOrderCount > 0 ? g.apiCount / apiOrderCount : 0,
        totalAvgPerOrder: totalOrderCount > 0 ? (g.waiterCount + g.apiCount) / totalOrderCount : 0,
        // Percentage of total category sales per channel
        waiterPctOfTotal: totalWaiterItems > 0 ? (g.waiterCount / totalWaiterItems * 100) : 0,
        apiPctOfTotal: totalApiItems > 0 ? (g.apiCount / totalApiItems * 100) : 0
      }))
      .sort((a, b) => b.total - a.total);

    // Calculate per-order metrics
    const orders = Object.values(orderDetails);
    const waiterOrders = orders.filter(o => o.channel === 'waiter');
    const apiOrders = orders.filter(o => o.channel === 'api');

    const calcPerOrderMetrics = (orderList) => {
      if (orderList.length === 0) return { 
        avgMains: 0, avgDrinks: 0, avgSides: 0, avgDesserts: 0, avgKids: 0, avgTotal: 0,
        orderCount: 0
      };
      const totalMains = orderList.reduce((sum, o) => sum + o.mains, 0);
      const totalDrinks = orderList.reduce((sum, o) => sum + o.drinks, 0);
      const totalSides = orderList.reduce((sum, o) => sum + o.sides, 0);
      const totalDesserts = orderList.reduce((sum, o) => sum + o.desserts, 0);
      const totalKids = orderList.reduce((sum, o) => sum + o.kids, 0);
      const totalItems = orderList.reduce((sum, o) => sum + o.total, 0);
      return {
        avgMains: totalMains / orderList.length,
        avgDrinks: totalDrinks / orderList.length,
        avgSides: totalSides / orderList.length,
        avgDesserts: totalDesserts / orderList.length,
        avgKids: totalKids / orderList.length,
        avgTotal: totalItems / orderList.length,
        orderCount: orderList.length
      };
    };

    const waiterPerOrder = calcPerOrderMetrics(waiterOrders);
    const apiPerOrder = calcPerOrderMetrics(apiOrders);

    // Mains distribution for table size estimation (excluding orders with 0 mains - typically AYCE)
    const mainsDistribution = {
      waiter: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0 },
      api: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0 }
    };
    
    // Track orders with mains for accurate table size
    const ordersWithMains = { waiter: [], api: [] };
    const ordersWithMinMains = { waiter: [], api: [] }; // For filtered view (2+ mains)
    
    orders.forEach(o => {
      const bucket = o.mains === 0 ? '0' : (o.mains >= 5 ? '5+' : o.mains.toString());
      mainsDistribution[o.channel][bucket] += 1;
      
      if (o.mains > 0) {
        ordersWithMains[o.channel].push(o);
      }
      if (o.mains >= 2) {
        ordersWithMinMains[o.channel].push(o);
      }
    });

    // Calculate avg mains ONLY for orders that have mains (better table size proxy)
    const calcTableSize = (orderList) => {
      if (orderList.length === 0) return { avgMains: 0, orderCount: 0 };
      const totalMains = orderList.reduce((sum, o) => sum + o.mains, 0);
      return {
        avgMains: totalMains / orderList.length,
        orderCount: orderList.length
      };
    };
    
    // Calculate for both 1+ and 2+ mains
    const waiterTableSize = calcTableSize(ordersWithMains.waiter);
    const apiTableSize = calcTableSize(ordersWithMains.api);
    const waiterTableSize2Plus = calcTableSize(ordersWithMinMains.waiter);
    const apiTableSize2Plus = calcTableSize(ordersWithMinMains.api);

    // Total orders with mains for percentage calculation
    const totalWaiterWithMains = ordersWithMains.waiter.length;
    const totalApiWithMains = ordersWithMains.api.length;

    // Convert to chart data with percentages (excluding 0 mains for clarity)
    const mainsDistData = [1, 2, 3, 4, '5+'].map(m => {
      const waiterCount = mainsDistribution.waiter[m] || 0;
      const apiCount = mainsDistribution.api[m] || 0;
      return {
        mains: m.toString(),
        waiter: waiterCount,
        api: apiCount,
        waiterPct: totalWaiterWithMains > 0 ? (waiterCount / totalWaiterWithMains * 100) : 0,
        apiPct: totalApiWithMains > 0 ? (apiCount / totalApiWithMains * 100) : 0
      };
    });

    return { 
      categories: categoryList, 
      groups: groupList,
      waiterPerOrder,
      apiPerOrder,
      mainsDistData,
      waiterTableSize,
      apiTableSize,
      waiterTableSize2Plus,
      apiTableSize2Plus,
      ordersWithoutMains: {
        waiter: mainsDistribution.waiter[0],
        api: mainsDistribution.api[0]
      },
      singleMainOrders: {
        waiter: mainsDistribution.waiter[1],
        api: mainsDistribution.api[1]
      }
    };
  }, [rawData, dateRange, dayFilter, selectedKitchens, selectedCategories, showAYCE]);

  // Order Rounds Analysis - how many times items were added to an order
  const orderRoundsAnalysis = useMemo(() => {
    if (!rawData) return null;

    const isItemLevel = rawData[0]?.hasOwnProperty('ORDER_TOTAL_LCY') || rawData[0]?.hasOwnProperty('O_PRICE_FINAL_BILL');
    if (!isItemLevel) return null;
    
    const hasAddonPricing = rawData[0]?.hasOwnProperty('I_MENU_PRICE_B_TAX');

    // Track item creation times and values per order
    const orderRounds = {};

    rawData.forEach(row => {
      const dateStr = row.ORDER_CREATED_AT?.substring(0, 10);
      if (!dateStr) return;
      if (dateRange.start && dateStr < dateRange.start) return;
      if (dateRange.end && dateStr > dateRange.end) return;
      if (dayFilter === 'weekend' && !isWeekend(dateStr)) return;
      if (dayFilter === 'weekday' && isWeekend(dateStr)) return;
      const kitchen = row.KITCHEN_NAME_CLEAN || row.DIM_KITCHEN_NAME;
      if (!selectedKitchens.includes('all') && !selectedKitchens.includes(kitchen)) return;
      
      // Apply category filter
      const category = row.CATEGORY_NAME || '';
      if (!selectedCategories.includes('all') && !selectedCategories.includes(category)) return;

      // Apply AYCE filter
      const itemName = row.ITEM_NAME_CLEAN || row.ITEM_NAME || '';
      const isAYCE = itemName.includes('AYCE') || (category && category.includes('AYCE'));
      if (!showAYCE && isAYCE) return;

      const orderId = row.ORDER_ID;
      const itemType = row.ITEM_ADDON_FLG || '';
      const itemCreatedAt = row.ITEM_CREATED_AT || '';
      const isAPI = row.CREATED_BY_FULL_NAME === 'DINE IN API';
      const quantity = parseInt(row.ITEM_QUANTITY) || 1;

      if (!orderId) return;

      // Get price based on item type - use I_MENU_PRICE_B_TAX for accurate pricing
      let price = 0;
      if (itemType === 'COMBO_ADDON') {
        price = hasAddonPricing ? (parseFloat(row.I_MENU_PRICE_B_TAX) || 0) : 0;
      } else if (itemType === 'COMBO_ITEM') {
        price = parseFloat(row.I_MENU_PRICE_B_TAX) || parseFloat(row.COMBO_PRICE_NET) || 0;
      }

      if (!orderRounds[orderId]) {
        orderRounds[orderId] = {
          channel: isAPI ? 'api' : 'waiter',
          rounds: {} // { timestamp: { itemCount, totalValue } }
        };
      }
      
      if (itemCreatedAt && (itemType === 'COMBO_ITEM' || itemType === 'COMBO_ADDON')) {
        if (!orderRounds[orderId].rounds[itemCreatedAt]) {
          orderRounds[orderId].rounds[itemCreatedAt] = { itemCount: 0, totalValue: 0 };
        }
        orderRounds[orderId].rounds[itemCreatedAt].itemCount += quantity;
        orderRounds[orderId].rounds[itemCreatedAt].totalValue += price * quantity;
      }
    });

    // Count rounds distribution and calculate average round values
    const roundsDist = {
      waiter: { 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0 },
      api: { 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0 }
    };
    
    // Track round values for averaging
    const roundValues = {
      waiter: [],
      api: []
    };
    
    // Track round values by bucket for per-row averages
    const roundValuesByBucket = {
      waiter: {},
      api: {}
    };

    Object.values(orderRounds).forEach(order => {
      const roundTimestamps = Object.keys(order.rounds);
      const numRounds = roundTimestamps.length || 1;
      const bucket = numRounds >= 5 ? '5+' : numRounds.toString();
      roundsDist[order.channel][bucket] += 1;
      
      // Calculate value per round for this order
      roundTimestamps.forEach(ts => {
        const roundData = order.rounds[ts];
        if (roundData.totalValue > 0) {
          roundValues[order.channel].push(roundData.totalValue);
        }
      });
      
      // Calculate total order value for this order (sum of all rounds)
      const orderTotalValue = roundTimestamps.reduce((sum, ts) => sum + order.rounds[ts].totalValue, 0);
      if (!roundValuesByBucket[order.channel][bucket]) {
        roundValuesByBucket[order.channel][bucket] = [];
      }
      if (orderTotalValue > 0) {
        // Average value per round for this order
        roundValuesByBucket[order.channel][bucket].push(orderTotalValue / numRounds);
      }
    });

    // Calculate totals and percentages
    const waiterTotal = Object.values(roundsDist.waiter).reduce((a, b) => a + b, 0);
    const apiTotal = Object.values(roundsDist.api).reduce((a, b) => a + b, 0);

    const roundsDistData = [1, 2, 3, 4, '5+'].map(r => {
      const waiterCount = roundsDist.waiter[r] || 0;
      const apiCount = roundsDist.api[r] || 0;
      const waiterValues = roundValuesByBucket.waiter[r] || [];
      const apiValues = roundValuesByBucket.api[r] || [];
      return {
        rounds: r.toString(),
        waiter: waiterCount,
        api: apiCount,
        waiterPct: waiterTotal > 0 ? (waiterCount / waiterTotal * 100) : 0,
        apiPct: apiTotal > 0 ? (apiCount / apiTotal * 100) : 0,
        waiterAvgValue: waiterValues.length > 0 ? waiterValues.reduce((a, b) => a + b, 0) / waiterValues.length : 0,
        apiAvgValue: apiValues.length > 0 ? apiValues.reduce((a, b) => a + b, 0) / apiValues.length : 0
      };
    });

    // Calculate average rounds
    const calcAvgRounds = (dist, total) => {
      if (total === 0) return 0;
      let sum = 0;
      for (let r = 1; r <= 4; r++) {
        sum += r * (dist[r] || 0);
      }
      sum += 5.5 * (dist['5+'] || 0); // Estimate 5+ as 5.5
      return sum / total;
    };
    
    // Calculate average round value
    const waiterAvgRoundValue = roundValues.waiter.length > 0 
      ? roundValues.waiter.reduce((a, b) => a + b, 0) / roundValues.waiter.length 
      : 0;
    const apiAvgRoundValue = roundValues.api.length > 0 
      ? roundValues.api.reduce((a, b) => a + b, 0) / roundValues.api.length 
      : 0;

    return {
      roundsDistData,
      waiterTotal,
      apiTotal,
      waiterAvgRounds: calcAvgRounds(roundsDist.waiter, waiterTotal),
      apiAvgRounds: calcAvgRounds(roundsDist.api, apiTotal),
      waiterMultiRound: waiterTotal - (roundsDist.waiter[1] || 0),
      apiMultiRound: apiTotal - (roundsDist.api[1] || 0),
      waiterMultiRoundPct: waiterTotal > 0 ? ((waiterTotal - (roundsDist.waiter[1] || 0)) / waiterTotal * 100) : 0,
      apiMultiRoundPct: apiTotal > 0 ? ((apiTotal - (roundsDist.api[1] || 0)) / apiTotal * 100) : 0,
      waiterAvgRoundValue,
      apiAvgRoundValue,
      waiterTotalRounds: roundValues.waiter.length,
      apiTotalRounds: roundValues.api.length
    };
  }, [rawData, dateRange, dayFilter, selectedKitchens, selectedCategories, showAYCE]);

  // AYCE vs Non-AYCE distribution (only for item-level data)
  const ayceDistribution = useMemo(() => {
    if (!rawData) return [];

    // Check if this is item-level data
    const isItemLevel = rawData[0]?.hasOwnProperty('ORDER_TOTAL_LCY') || rawData[0]?.hasOwnProperty('O_PRICE_FINAL_BILL');
    if (!isItemLevel) {
      return [];
    }

    let ayceCount = 0, nonAyceCount = 0;
    let ayceRevenue = 0, nonAyceRevenue = 0;

    rawData.forEach(row => {
      const dateStr = row.ORDER_CREATED_AT?.substring(0, 10);
      if (!dateStr) return;
      if (dateRange.start && dateStr < dateRange.start) return;
      if (dateRange.end && dateStr > dateRange.end) return;
      if (dayFilter === 'weekend' && !isWeekend(dateStr)) return;
      if (dayFilter === 'weekday' && isWeekend(dateStr)) return;
      const kitchen = row.KITCHEN_NAME_CLEAN || row.DIM_KITCHEN_NAME;
      if (!selectedKitchens.includes('all') && !selectedKitchens.includes(kitchen)) return;

      // Apply category filter
      const category = row.CATEGORY_NAME || '';
      if (!selectedCategories.includes('all') && !selectedCategories.includes(category)) return;

      const itemName = row.ITEM_NAME_CLEAN || row.ITEM_NAME || '';
      const itemType = row.ITEM_ADDON_FLG || 'OTHER';
      const isAYCE = itemName.includes('AYCE') || (row.CATEGORY_NAME && row.CATEGORY_NAME.includes('AYCE'));
      const quantity = parseInt(row.ITEM_QUANTITY) || 1;
      
      // For addons: use I_MENU_PRICE_B_TAX, for items: use COMBO_PRICE_NET
      const hasAddonPricing = row.hasOwnProperty('I_MENU_PRICE_B_TAX');
      let price = 0;
      if (itemType === 'COMBO_ADDON') {
        price = hasAddonPricing ? (parseFloat(row.I_MENU_PRICE_B_TAX) || 0) : 0;
      } else {
        price = parseFloat(row.I_MENU_PRICE_B_TAX) || parseFloat(row.COMBO_PRICE_NET) || 0;
      }

      if (isAYCE) {
        ayceCount += quantity;
        ayceRevenue += price * quantity;
      } else {
        nonAyceCount += quantity;
        nonAyceRevenue += price * quantity;
      }
    });

    return [
      { name: 'AYCE', count: ayceCount, revenue: ayceRevenue, color: '#F59E0B' },
      { name: 'Non-AYCE', count: nonAyceCount, revenue: nonAyceRevenue, color: '#06B6D4' }
    ];
  }, [rawData, dateRange, dayFilter, selectedKitchens, selectedCategories, showAYCE]);

  // Waiter vs API Comparison Analytics
  const channelComparison = useMemo(() => {
    if (!rawData) return null;

    // Detect file format
    const isItemLevel = rawData[0]?.hasOwnProperty('ORDER_TOTAL_LCY') || rawData[0]?.hasOwnProperty('O_PRICE_FINAL_BILL');
    
    // Check if addon pricing column exists
    const hasAddonPricing = rawData[0]?.hasOwnProperty('I_MENU_PRICE_B_TAX');

    // Identify AYCE orders to filter out
    const ayceOrderIds = new Set();
    if (isItemLevel && !showAYCE) {
      rawData.forEach(row => {
        const itemName = row.ITEM_NAME_CLEAN || row.ITEM_NAME || '';
        const categoryName = row.CATEGORY_NAME || '';
        if (itemName.includes('AYCE') || categoryName.includes('AYCE')) {
          ayceOrderIds.add(row.ORDER_ID);
        }
      });
    }

    const orderDetails = {};
    const addonsByChannel = { waiter: {}, api: {} };

    rawData.forEach(row => {
      const dateStr = row.ORDER_CREATED_AT?.substring(0, 10);
      if (!dateStr) return;
      if (dateRange.start && dateStr < dateRange.start) return;
      if (dateRange.end && dateStr > dateRange.end) return;
      if (dayFilter === 'weekend' && !isWeekend(dateStr)) return;
      if (dayFilter === 'weekday' && isWeekend(dateStr)) return;
      const kitchen = row.KITCHEN_NAME_CLEAN || row.DIM_KITCHEN_NAME;
      if (!selectedKitchens.includes('all') && !selectedKitchens.includes(kitchen)) return;

      // Apply category filter
      const category = row.CATEGORY_NAME || '';
      if (!selectedCategories.includes('all') && !selectedCategories.includes(category)) return;

      const orderId = row.ORDER_ID;
      if (!orderId) return;

      // Skip AYCE orders if filter is set to hide
      if (!showAYCE && ayceOrderIds.has(orderId)) return;

      const isAPI = row.CREATED_BY_FULL_NAME === 'DINE IN API';
      const channel = isAPI ? 'api' : 'waiter';
      const itemType = row.ITEM_ADDON_FLG || 'OTHER';
      const quantity = parseInt(row.ITEM_QUANTITY) || 1;
      const itemName = row.ITEM_NAME_CLEAN || row.ITEM_NAME || 'Unknown';
      
      // For addons: use I_MENU_PRICE_B_TAX (actual addon price charged to customer)
      // For items: use I_MENU_PRICE_B_TAX if available, otherwise COMBO_PRICE_NET
      // Note: P_MENU_PRICE_B_TAX is the parent combo/position price, NOT the addon price
      const hasAddonPricing = row.hasOwnProperty('I_MENU_PRICE_B_TAX');
      let price = 0;
      if (itemType === 'COMBO_ADDON') {
        // Only I_MENU_PRICE_B_TAX gives accurate addon pricing
        price = hasAddonPricing ? (parseFloat(row.I_MENU_PRICE_B_TAX) || 0) : 0;
      } else {
        price = parseFloat(row.I_MENU_PRICE_B_TAX) || parseFloat(row.COMBO_PRICE_NET) || 0;
      }

      // Get bill amount - use ORDER_TOTAL_LCY as primary
      let bill;
      if (row.ORDER_TOTAL_LCY !== undefined) {
        bill = parseFloat(row.ORDER_TOTAL_LCY || 0);
      } else if (isItemLevel) {
        const finalBill = parseFloat(row.O_PRICE_FINAL_BILL || 0);
        const wallet = parseFloat(row.WALLET_PAYMENT_AMOUNT || 0);
        bill = finalBill + wallet;
      } else {
        bill = parseFloat(row.TOTAL_PARTED_BILL_AMOUNT || 0);
      }

      if (!orderDetails[orderId]) {
        orderDetails[orderId] = {
          channel,
          totalItems: 0,
          totalAddons: 0,
          totalPaidAddons: 0,
          totalCombos: 0,
          itemRevenue: 0,
          addonRevenue: 0,
          bill
        };
      }

      // Only process item-level data for item/addon counts
      if (isItemLevel) {
        if (itemType === 'COMBO_ITEM') {
          orderDetails[orderId].totalItems += quantity;
          orderDetails[orderId].itemRevenue += price * quantity;
        } else if (itemType === 'COMBO_ADDON') {
          orderDetails[orderId].totalAddons += quantity;
          
          // Only count paid addons (price > 0) for metrics and tracking
          if (price > 0) {
            orderDetails[orderId].totalPaidAddons += quantity;
            orderDetails[orderId].addonRevenue += price * quantity;
            
            // Track addon popularity by channel (paid only)
            if (!addonsByChannel[channel][itemName]) {
              addonsByChannel[channel][itemName] = { name: itemName, count: 0, revenue: 0, prices: [] };
            }
            addonsByChannel[channel][itemName].count += quantity;
            addonsByChannel[channel][itemName].revenue += price * quantity;
            // Track unique prices for this addon
            if (!addonsByChannel[channel][itemName].prices.includes(price)) {
              addonsByChannel[channel][itemName].prices.push(price);
            }
          }
        }
      }
    });

    const orders = Object.values(orderDetails);
    const waiterOrders = orders.filter(o => o.channel === 'waiter');
    const apiOrders = orders.filter(o => o.channel === 'api');

    // Calculate metrics
    const calcMetrics = (orderList) => {
      if (orderList.length === 0) return { 
        orderCount: 0, avgItems: 0, avgAddons: 0, addonRate: 0, 
        avgItemRevenue: 0, avgAddonRevenue: 0, avgBasketSize: 0,
        avgOrderValue: 0, avgAddonsWhenAdded: 0
      };
      
      const withPaidAddons = orderList.filter(o => o.totalPaidAddons > 0).length;
      const ordersWithAddons = orderList.filter(o => o.totalPaidAddons > 0);
      const totalItems = orderList.reduce((sum, o) => sum + o.totalItems, 0);
      const totalPaidAddons = orderList.reduce((sum, o) => sum + o.totalPaidAddons, 0);
      const totalItemRevenue = orderList.reduce((sum, o) => sum + o.itemRevenue, 0);
      const totalAddonRevenue = orderList.reduce((sum, o) => sum + o.addonRevenue, 0);
      const totalBill = orderList.reduce((sum, o) => sum + o.bill, 0);
      
      // Avg addons when customer adds any
      const avgAddonsWhenAdded = ordersWithAddons.length > 0 
        ? ordersWithAddons.reduce((sum, o) => sum + o.totalPaidAddons, 0) / ordersWithAddons.length 
        : 0;

      return {
        orderCount: orderList.length,
        avgItems: totalItems / orderList.length,
        avgAddons: totalPaidAddons / orderList.length,
        addonRate: (withPaidAddons / orderList.length) * 100,
        avgItemRevenue: totalItemRevenue / orderList.length,
        avgAddonRevenue: totalAddonRevenue / orderList.length,
        avgBasketSize: (totalItems + totalPaidAddons) / orderList.length,
        avgOrderValue: totalBill / orderList.length,
        avgAddonsWhenAdded,
        ordersWithAddons: withPaidAddons,
        totalAddonRevenue
      };
    };

    const waiterMetrics = calcMetrics(waiterOrders);
    const apiMetrics = calcMetrics(apiOrders);

    // Basket size distribution
    const basketBins = ['1-2', '3-4', '5-6', '7-8', '9-10', '11+'];
    const basketDistribution = basketBins.map(bin => ({ bin, waiter: 0, api: 0 }));
    
    orders.forEach(o => {
      const size = o.totalItems + o.totalPaidAddons;
      let binIndex;
      if (size <= 2) binIndex = 0;
      else if (size <= 4) binIndex = 1;
      else if (size <= 6) binIndex = 2;
      else if (size <= 8) binIndex = 3;
      else if (size <= 10) binIndex = 4;
      else binIndex = 5;
      
      basketDistribution[binIndex][o.channel === 'api' ? 'api' : 'waiter'] += 1;
    });

    // Top addons by channel - include avg price
    const topWaiterAddons = Object.values(addonsByChannel.waiter)
      .map(a => ({
        ...a,
        avgPrice: a.count > 0 ? a.revenue / a.count : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topApiAddons = Object.values(addonsByChannel.api)
      .map(a => ({
        ...a,
        avgPrice: a.count > 0 ? a.revenue / a.count : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      waiterMetrics,
      apiMetrics,
      basketDistribution,
      topWaiterAddons,
      topApiAddons,
      hasAddonPricing,
      comparisonData: [
        { metric: 'Avg Items/Order', waiter: waiterMetrics.avgItems, api: apiMetrics.avgItems },
        { metric: 'Avg Paid Addons/Order', waiter: waiterMetrics.avgAddons, api: apiMetrics.avgAddons },
        { metric: 'Avg Basket Size', waiter: waiterMetrics.avgBasketSize, api: apiMetrics.avgBasketSize },
      ]
    };
  }, [rawData, dateRange, dayFilter, selectedKitchens, selectedCategories, showAYCE]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);

    // Upload to cloud storage only if saveToCloud is enabled
    if (saveToCloud) {
      uploadAndSaveFile(file);
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setRawData(results.data);
        setDateRange({ start: '', end: '' });
        setSelectedKitchens(['all']);
      },
      error: (err) => {
        console.error('Parse error:', err);
      }
    });
  };

  const clearFile = () => {
    setRawData(null);
    setFileName('');
    setDateRange({ start: '', end: '' });
    setSelectedKitchens(['all']);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatNumber = (num) => new Intl.NumberFormat('en-US').format(Math.round(num));
  const formatCurrency = (num) => `AED ${new Intl.NumberFormat('en-US').format(Math.round(num))}`;

  const toggleKitchen = (kitchen) => {
    if (kitchen === 'all') {
      setSelectedKitchens(['all']);
    } else {
      let newSelection = selectedKitchens.filter(k => k !== 'all');
      if (newSelection.includes(kitchen)) {
        newSelection = newSelection.filter(k => k !== kitchen);
      } else {
        newSelection.push(kitchen);
      }
      if (newSelection.length === 0) {
        setSelectedKitchens(['all']);
      } else {
        setSelectedKitchens(newSelection);
      }
    }
  };

  const toggleItemType = (type) => {
    if (type === 'all') {
      setSelectedItemTypes(['all']);
    } else {
      let newSelection = selectedItemTypes.filter(t => t !== 'all');
      if (newSelection.includes(type)) {
        newSelection = newSelection.filter(t => t !== type);
      } else {
        newSelection.push(type);
      }
      if (newSelection.length === 0) {
        setSelectedItemTypes(['all']);
      } else {
        setSelectedItemTypes(newSelection);
      }
    }
  };

  // Quick date filter functions
  const getDateRange = (preset) => {
    const today = new Date();
    // Get day of week where Monday = 0, Sunday = 6
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    
    const formatDateStr = (d) => d.toISOString().split('T')[0];
    
    switch(preset) {
      case 'today':
        return { start: formatDateStr(today), end: formatDateStr(today) };
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { start: formatDateStr(yesterday), end: formatDateStr(yesterday) };
      }
      case 'thisWeek': {
        // Start from Monday of current week
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        return { start: formatDateStr(startOfWeek), end: formatDateStr(today) };
      }
      case 'lastWeek': {
        // Monday to Sunday of last week
        const startOfLastWeek = new Date(today);
        startOfLastWeek.setDate(today.getDate() - dayOfWeek - 7);
        const endOfLastWeek = new Date(today);
        endOfLastWeek.setDate(today.getDate() - dayOfWeek - 1);
        return { start: formatDateStr(startOfLastWeek), end: formatDateStr(endOfLastWeek) };
      }
      case 'last7Days': {
        const last7 = new Date(today);
        last7.setDate(today.getDate() - 6);
        return { start: formatDateStr(last7), end: formatDateStr(today) };
      }
      case 'last30Days': {
        const last30 = new Date(today);
        last30.setDate(today.getDate() - 29);
        return { start: formatDateStr(last30), end: formatDateStr(today) };
      }
      case 'thisMonth': {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: formatDateStr(startOfMonth), end: formatDateStr(today) };
      }
      case 'lastMonth': {
        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: formatDateStr(startOfLastMonth), end: formatDateStr(endOfLastMonth) };
      }
      default:
        return { start: '', end: '' };
    }
  };

  const applyQuickFilter = (preset) => {
    const range = getDateRange(preset);
    // Clamp to available data range
    if (dateExtent.min && range.start < dateExtent.min) range.start = dateExtent.min;
    if (dateExtent.max && range.end > dateExtent.max) range.end = dateExtent.max;
    setDateRange(range);
  };

  const CustomXAxisTick = ({ x, y, payload }) => {
    const weekend = isWeekend(payload.value);
    return (
      <g transform={`translate(${x},${y})`}>
        <rect 
          x={-18} y={2} width={36} height={18} rx={4}
          fill={weekend ? 'rgba(252, 211, 77, 0.2)' : 'transparent'}
        />
        <text 
          x={0} y={14} textAnchor="middle" 
          fill={weekend ? COLORS.weekend : COLORS.textMuted}
          fontSize={10}
          fontWeight={weekend ? 600 : 400}
        >
          {formatDate(payload.value)}
        </text>
      </g>
    );
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    const weekend = isWeekend(label);
    return (
      <div style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: '12px 16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.4)'
      }}>
        <p style={{ margin: 0, color: COLORS.text, fontWeight: 600, marginBottom: 8 }}>
          {formatDate(label)} {weekend && <span style={{ color: COLORS.weekend, fontSize: 11 }}>(Weekend)</span>}
        </p>
        {payload.map((p, i) => (
          <p key={i} style={{ margin: '4px 0', color: p.color, fontSize: 13 }}>
            {p.name}: AED {p.value.toFixed(0)}
          </p>
        ))}
      </div>
    );
  };

  const KitchenTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    return (
      <div style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: '12px 16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        maxWidth: 250
      }}>
        <p style={{ margin: 0, color: COLORS.text, fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
          {data.fullName}
        </p>
        <p style={{ margin: '4px 0', color: COLORS.waiter, fontSize: 13 }}>
          Waiter AOV: AED {data.waiterAOV.toFixed(0)} ({formatNumber(data.waiterOrders)} orders)
        </p>
        <p style={{ margin: '4px 0', color: COLORS.api, fontSize: 13 }}>
          Self-Order AOV: AED {data.apiAOV.toFixed(0)} ({formatNumber(data.apiOrders)} orders)
        </p>
      </div>
    );
  };

  // Upload Screen
  if (!rawData) {
    return (
      <div style={styles.container}>
        <div style={styles.uploadScreen}>
          <div style={styles.uploadCard}>
            <div style={styles.uploadIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h1 style={styles.uploadTitle}>Dine-In Analytics</h1>
            <p style={styles.uploadSubtitle}>Waiter vs Self-Ordering Performance Dashboard</p>
            
            {/* Saved Files Section - Show first if files exist */}
            {!loadingFiles && savedFiles.length > 0 && (
              <div style={styles.savedFilesSection}>
                <h3 style={styles.savedFilesTitle}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: 8}}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  Select a Data File
                </h3>
                
                <div style={styles.filesList}>
                  {savedFiles.map((file, index) => (
                    <button
                      key={index}
                      onClick={() => loadFileFromUrl(file.url, file.filename)}
                      style={{
                        ...styles.savedFileBtn,
                        ...(index === 0 ? styles.savedFileBtnRecent : {})
                      }}
                      disabled={loadingFromCloud}
                    >
                      <div style={styles.fileInfo}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={index === 0 ? COLORS.accent : COLORS.textMuted} strokeWidth="2" style={{marginRight: 8, flexShrink: 0}}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <div style={styles.fileDetails}>
                          <span style={{...styles.fileNameText, color: index === 0 ? COLORS.text : COLORS.textMuted}}>
                            {file.filename}
                            {index === 0 && <span style={styles.recentBadge}>Most Recent</span>}
                          </span>
                          <span style={styles.fileMeta}>
                            {(file.size / 1024 / 1024).toFixed(2)} MB • Uploaded {new Date(file.uploadedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={index === 0 ? COLORS.accent : COLORS.textMuted} strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  ))}
                </div>
                
                {loadingFromCloud && (
                  <div style={styles.loadingOverlay}>
                    <p>Loading file...</p>
                  </div>
                )}
                
                <div style={styles.dividerWithText}>
                  <span style={styles.dividerLine}></span>
                  <span style={styles.dividerText}>or upload new</span>
                  <span style={styles.dividerLine}></span>
                </div>
              </div>
            )}

            {loadingFiles && (
              <p style={styles.loadingText}>Loading saved files...</p>
            )}

            {!loadingFiles && savedFiles.length === 0 && (
              <p style={{...styles.uploadSubtitle, marginBottom: 20}}>Upload a CSV file to get started</p>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={styles.fileInput}
              id="csv-upload"
            />
            
            {/* Save to cloud checkbox */}
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={saveToCloud}
                onChange={(e) => setSaveToCloud(e.target.checked)}
                style={styles.checkbox}
              />
              <span style={styles.checkboxText}>Save file for other users</span>
            </label>
            
            <label htmlFor="csv-upload" style={{
              ...styles.uploadBtn,
              ...(savedFiles.length > 0 ? styles.uploadBtnSecondary : {})
            }}>
              {uploading ? 'Uploading...' : (saveToCloud ? 'Upload & Save CSV' : 'Upload CSV (no save)')}
            </label>
            
            <p style={styles.uploadHint}>
              Required columns: ORDER_ID, ORDER_CREATED_AT, CREATED_BY_FULL_NAME, KITCHEN_NAME_CLEAN, ORDER_TOTAL_LCY
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dine-In Analytics</h1>
          <p style={styles.subtitle}>Waiter vs Self-Order Performance</p>
        </div>
        <div style={styles.fileInfo}>
          <span style={styles.fileName}>{fileName}</span>
          <button onClick={clearFile} style={styles.clearBtn}>Change File</button>
        </div>
      </div>

      {/* Filters Row */}
      <div style={styles.filtersRow}>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Date Range</span>
          <div style={styles.dateInputs}>
            <input
              type="date"
              value={dateRange.start}
              min={dateExtent.min}
              max={dateExtent.max}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              style={styles.dateInput}
            />
            <span style={styles.dateSeparator}>to</span>
            <input
              type="date"
              value={dateRange.end}
              min={dateExtent.min}
              max={dateExtent.max}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              style={styles.dateInput}
            />
            {(dateRange.start || dateRange.end) && (
              <button 
                onClick={() => setDateRange({ start: '', end: '' })}
                style={styles.clearDateBtn}
              >
                Clear
              </button>
            )}
          </div>
          <div style={styles.quickFilters}>
            {[
              { key: 'today', label: 'Today' },
              { key: 'yesterday', label: 'Yesterday' },
              { key: 'thisWeek', label: 'This Week' },
              { key: 'lastWeek', label: 'Last Week' },
              { key: 'last7Days', label: 'Last 7 Days' },
              { key: 'last30Days', label: 'Last 30 Days' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => applyQuickFilter(key)}
                style={styles.quickFilterBtn}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Day Type</span>
          <div style={styles.toggleGroup}>
            {['all', 'weekday', 'weekend'].map(opt => (
              <button
                key={opt}
                onClick={() => setDayFilter(opt)}
                style={{
                  ...styles.toggleBtn,
                  ...(dayFilter === opt ? styles.toggleBtnActive : {})
                }}
              >
                {opt === 'all' ? 'All Days' : opt === 'weekday' ? 'Weekdays' : 'Weekends'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Kitchen Filter */}
      <div style={styles.kitchenFilterRow}>
        <span style={styles.filterLabel}>Kitchen Filter</span>
        <div style={styles.kitchenTags}>
          <button
            onClick={() => toggleKitchen('all')}
            style={{
              ...styles.kitchenTag,
              ...(selectedKitchens.includes('all') ? styles.kitchenTagActive : {})
            }}
          >
            All Kitchens
          </button>
          {allKitchens.map(kitchen => (
            <button
              key={kitchen}
              onClick={() => toggleKitchen(kitchen)}
              style={{
                ...styles.kitchenTag,
                ...(selectedKitchens.includes(kitchen) ? styles.kitchenTagActive : {})
              }}
            >
              {kitchen}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      {allCategories.length > 0 && (
        <div style={styles.kitchenFilterRow}>
          <span style={styles.filterLabel}>Category Filter</span>
          <div style={styles.kitchenTags}>
            <button
              onClick={() => toggleCategory('all')}
              style={{
                ...styles.kitchenTag,
                ...(selectedCategories.includes('all') ? styles.kitchenTagActive : {})
              }}
            >
              All Categories
            </button>
            {allCategories.map(category => (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                style={{
                  ...styles.kitchenTag,
                  ...(selectedCategories.includes(category) ? styles.kitchenTagActive : {})
                }}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Item Filters Row */}
      <div style={styles.filtersRow}>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>AYCE Items</span>
          <div style={styles.toggleGroup}>
            <button
              onClick={() => setShowAYCE(true)}
              style={{
                ...styles.toggleBtn,
                ...(showAYCE ? styles.toggleBtnActive : {})
              }}
            >
              Show
            </button>
            <button
              onClick={() => setShowAYCE(false)}
              style={{
                ...styles.toggleBtn,
                ...(!showAYCE ? styles.toggleBtnActive : {})
              }}
            >
              Hide
            </button>
          </div>
        </div>

        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Item Type</span>
          <div style={styles.toggleGroup}>
            <button
              onClick={() => toggleItemType('all')}
              style={{
                ...styles.toggleBtn,
                ...(selectedItemTypes.includes('all') ? styles.toggleBtnActive : {})
              }}
            >
              All
            </button>
            <button
              onClick={() => toggleItemType('COMBO_ITEM')}
              style={{
                ...styles.toggleBtn,
                ...(selectedItemTypes.includes('COMBO_ITEM') ? styles.toggleBtnActive : {})
              }}
            >
              Items
            </button>
            <button
              onClick={() => toggleItemType('COMBO_ADDON')}
              style={{
                ...styles.toggleBtn,
                ...(selectedItemTypes.includes('COMBO_ADDON') ? styles.toggleBtnActive : {})
              }}
            >
              Add-ons
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <span style={{...styles.legendDot, background: COLORS.waiter}}></span>
          <span>Waiter</span>
        </div>
        <div style={styles.legendItem}>
          <span style={{...styles.legendDot, background: COLORS.api}}></span>
          <span>Self-Order</span>
        </div>
        <div style={styles.legendItem}>
          <span style={{...styles.legendDot, background: COLORS.weekend}}></span>
          <span>Weekend</span>
        </div>
        <div style={styles.legendItemMuted}>
          Showing {filteredData.length} days
        </div>
      </div>

      {/* ==================== SECTION: ADOPTION & ORDER DISTRIBUTION ==================== */}
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Adoption & Order Distribution</h2>
      </div>

      <div style={styles.grid}>
        {/* Pie Chart */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>
            Order Distribution
            <InfoTooltip text="Distribution of orders between Waiter-assisted and Self-Order (self-service app) channels">
              <span style={styles.tooltipIcon}>ⓘ</span>
            </InfoTooltip>
          </h3>
          <div style={styles.pieContainer}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => formatNumber(value)}
                  contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                  itemStyle={{ color: COLORS.text }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={styles.pieStats}>
              {pieData.map((d, i) => (
                <div key={i} style={styles.pieStat}>
                  <span style={{...styles.pieStatDot, background: d.color}}></span>
                  <div>
                    <div style={styles.pieStatValue}>{formatNumber(d.value)}</div>
                    <div style={styles.pieStatLabel}>{d.name}</div>
                    <div style={styles.pieStatPercent}>
                      {pieData[0].value + pieData[1].value > 0 
                        ? ((d.value / (pieData[0].value + pieData[1].value)) * 100).toFixed(1)
                        : 0}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Kitchen Adoption Chart - Vertical bars with dynamic scale */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>
            Self-Ordering Adoption by Kitchen
            <InfoTooltip text="Self-ordering adoption rate (% of orders via Self-Order) per kitchen location">
              <span style={styles.tooltipIcon}>ⓘ</span>
            </InfoTooltip>
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart 
              data={kitchenAOVData} 
              margin={{ top: 10, right: 30, left: 10, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={true} vertical={false} />
              <XAxis 
                type="category" 
                dataKey="name" 
                tick={{ fill: COLORS.textMuted, fontSize: 9 }} 
                axisLine={false} 
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={60}
                tickFormatter={(v) => v.length > 15 ? v.substring(0, 15) + '...' : v}
              />
              <YAxis 
                type="number" 
                tick={{ fill: COLORS.textMuted, fontSize: 11 }} 
                axisLine={false} 
                tickLine={false}
                domain={[0, (dataMax) => Math.ceil((dataMax * 1.2) / 5) * 5 || 10]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip 
                formatter={(value, name, props) => [
                  `${value.toFixed(1)}% (${formatNumber(props.payload.apiOrders)} of ${formatNumber(props.payload.totalOrders)} orders)`,
                  'Self-Order Adoption'
                ]}
                contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                itemStyle={{ color: COLORS.text }}
              />
              <Bar dataKey="adoptionRate" fill={COLORS.api} radius={[4, 4, 0, 0]} barSize={32}>
                <LabelList 
                  dataKey="adoptionRate" 
                  position="top" 
                  formatter={(v) => `${v.toFixed(1)}%`}
                  style={{ fill: COLORS.textMuted, fontSize: 9 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ==================== SECTION: AOV & ORDER VALUE ==================== */}
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>AOV & Order Value Analysis</h2>
      </div>

      {/* Overall AOV Summary */}
      <div style={{...styles.card, marginTop: 20}}>
        <h3 style={styles.cardTitle}>Overall AOV Summary (Selected Period)</h3>
        <div style={styles.overallAOVGrid}>
          <div style={styles.aovSummaryCard}>
            <div style={{...styles.aovSummaryIcon, background: `${COLORS.waiter}20`}}>
              <div style={{...styles.aovSummaryDot, background: COLORS.waiter}}></div>
            </div>
            <div>
              <div style={styles.aovSummaryLabel}>
                Waiter AOV
                <InfoTooltip text="Average Order Value for waiter-assisted orders. Calculated as: ORDER_TOTAL_LCY ÷ Number of Orders.">
                  <span style={styles.infoIconSmall}>ⓘ</span>
                </InfoTooltip>
              </div>
              <div style={styles.aovSummaryValue}>{formatCurrency(overallAOV.waiterAOV)}</div>
              <div style={styles.aovSummaryMedian}>
                Median: {formatCurrency(overallAOV.waiterMedian)}
                <InfoTooltip text="Median is the middle value when all order values are sorted. Less affected by outliers than average.">
                  <span style={styles.infoIconSmall}>ⓘ</span>
                </InfoTooltip>
              </div>
              <div style={styles.aovSummaryMeta}>
                {formatNumber(overallAOV.waiterOrders)} orders · {formatCurrency(overallAOV.waiterBill)} total
              </div>
            </div>
          </div>
          <div style={styles.aovSummaryCard}>
            <div style={{...styles.aovSummaryIcon, background: `${COLORS.api}20`}}>
              <div style={{...styles.aovSummaryDot, background: COLORS.api}}></div>
            </div>
            <div>
              <div style={styles.aovSummaryLabel}>
                Self-Order AOV
                <InfoTooltip text="Average Order Value for self-service app orders. Calculated as: ORDER_TOTAL_LCY ÷ Number of Orders.">
                  <span style={styles.infoIconSmall}>ⓘ</span>
                </InfoTooltip>
              </div>
              <div style={styles.aovSummaryValue}>{formatCurrency(overallAOV.apiAOV)}</div>
              <div style={styles.aovSummaryMedian}>
                Median: {formatCurrency(overallAOV.apiMedian)}
                <InfoTooltip text="Median is the middle value when all order values are sorted. Less affected by outliers than average.">
                  <span style={styles.infoIconSmall}>ⓘ</span>
                </InfoTooltip>
              </div>
              <div style={styles.aovSummaryMeta}>
                {formatNumber(overallAOV.apiOrders)} orders · {formatCurrency(overallAOV.apiBill)} total
              </div>
            </div>
          </div>
          <div style={styles.aovSummaryCard}>
            <div style={{...styles.aovSummaryIcon, background: overallAOV.apiAOV >= overallAOV.waiterAOV ? `${COLORS.success}20` : `${COLORS.danger}20`}}>
              <div style={{...styles.aovSummaryDot, background: overallAOV.apiAOV >= overallAOV.waiterAOV ? COLORS.success : COLORS.danger}}></div>
            </div>
            <div>
              <div style={styles.aovSummaryLabel}>
                AOV Difference
                <InfoTooltip text="Difference between Self-Order AOV and Waiter AOV. Green = API higher (good for self-service), Red = API lower">
                  <span style={styles.infoIconSmall}>ⓘ</span>
                </InfoTooltip>
              </div>
              <div style={{
                ...styles.aovSummaryValue,
                color: overallAOV.apiAOV >= overallAOV.waiterAOV ? COLORS.success : COLORS.danger
              }}>
                {overallAOV.apiAOV >= overallAOV.waiterAOV ? '+' : ''}{formatCurrency(overallAOV.apiAOV - overallAOV.waiterAOV)}
              </div>
              <div style={{...styles.aovSummaryMedian, color: overallAOV.apiMedian >= overallAOV.waiterMedian ? COLORS.success : COLORS.danger}}>
                Median diff: {overallAOV.apiMedian >= overallAOV.waiterMedian ? '+' : ''}{formatCurrency(overallAOV.apiMedian - overallAOV.waiterMedian)}
              </div>
              <div style={styles.aovSummaryMeta}>
                API {overallAOV.apiAOV >= overallAOV.waiterAOV ? 'higher' : 'lower'} by {overallAOV.waiterAOV > 0 ? Math.abs(((overallAOV.apiAOV - overallAOV.waiterAOV) / overallAOV.waiterAOV) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Order Value Distribution */}
      <div style={{...styles.grid, gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 20}}>
        {/* Order Value Bins - Waiter */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>
            Order Value Distribution - Waiter (AED)
            <InfoTooltip text="Histogram showing how waiter orders are distributed across different order value ranges (in AED)">
              <span style={styles.tooltipIcon}>ⓘ</span>
            </InfoTooltip>
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={orderValueBinsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
              <XAxis 
                dataKey="label" 
                tick={{ fill: COLORS.textMuted, fontSize: 10 }}
                axisLine={{ stroke: COLORS.border }}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis 
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
              />
              <Tooltip 
                formatter={(value) => [formatNumber(value), 'Orders']}
                contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                itemStyle={{ color: COLORS.text }}
                labelStyle={{ color: COLORS.text }}
                labelFormatter={(label) => `AED ${label}`}
              />
              <Bar dataKey="waiter" fill={COLORS.waiter} radius={[4, 4, 0, 0]} name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Order Value Bins - API */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>
            Order Value Distribution - Self-Order (AED)
            <InfoTooltip text="Histogram showing how Self-Order orders are distributed across different order value ranges (in AED)">
              <span style={styles.tooltipIcon}>ⓘ</span>
            </InfoTooltip>
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={orderValueBinsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
              <XAxis 
                dataKey="label" 
                tick={{ fill: COLORS.textMuted, fontSize: 10 }}
                axisLine={{ stroke: COLORS.border }}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis 
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                formatter={(value) => [formatNumber(value), 'Orders']}
                contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                itemStyle={{ color: COLORS.text }}
                labelStyle={{ color: COLORS.text }}
                labelFormatter={(label) => `AED ${label}`}
              />
              <Bar dataKey="api" fill={COLORS.api} radius={[4, 4, 0, 0]} name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily AOV Chart */}
      <div style={{...styles.card, marginTop: 20}}>
        <h3 style={styles.cardTitle}>
          Daily Average Order Value (AOV)
          <InfoTooltip text="Daily AOV comparison between Waiter and Self-Order channels. Weekend days are highlighted.">
            <span style={styles.tooltipIcon}>ⓘ</span>
          </InfoTooltip>
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={aovData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
            <XAxis 
              dataKey="date" 
              tick={<CustomXAxisTick />}
              axisLine={{ stroke: COLORS.border }}
              tickLine={false}
              interval={aovData.length > 14 ? Math.floor(aovData.length / 10) : 0}
              height={40}
            />
            <YAxis 
              tick={{ fill: COLORS.textMuted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}`}
              domain={[0, 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="waiterAOV" fill={COLORS.waiter} radius={[3, 3, 0, 0]} name="Waiter AOV" maxBarSize={20} />
            <Bar dataKey="apiAOV" fill={COLORS.api} radius={[3, 3, 0, 0]} name="Self-Order AOV" maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* AOV per Kitchen */}
      <div style={{...styles.card, marginTop: 20}}>
        <h3 style={styles.cardTitle}>
          Average AOV by Kitchen
          <InfoTooltip text="Average Order Value broken down by kitchen location, comparing Waiter vs Self-Order performance">
            <span style={styles.tooltipIcon}>ⓘ</span>
          </InfoTooltip>
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(300, kitchenAOVData.length * 50)}>
          <BarChart 
            data={kitchenAOVData} 
            layout="vertical"
            margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={true} vertical={false} />
            <XAxis 
              type="number"
              tick={{ fill: COLORS.textMuted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}`}
            />
            <YAxis 
              type="category"
              dataKey="name"
              tick={{ fill: COLORS.textMuted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={120}
            />
            <Tooltip content={<KitchenTooltip />} />
            <Bar dataKey="waiterAOV" fill={COLORS.waiter} radius={[0, 4, 4, 0]} name="Waiter AOV" barSize={16} />
            <Bar dataKey="apiAOV" fill={COLORS.api} radius={[0, 4, 4, 0]} name="Self-Order AOV" barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* AOV by Location Category */}
      <div style={{...styles.card, marginTop: 20}}>
        <h3 style={styles.cardTitle}>
          AOV by Location Category
          <InfoTooltip text="Average Order Value grouped by location category, comparing Waiter vs Self-Order performance. Expand each category to see constituent kitchens.">
            <span style={styles.tooltipIcon}>ⓘ</span>
          </InfoTooltip>
        </h3>
        
        {locationCategoryAOV.length === 0 ? (
          <div style={{padding: 40, textAlign: 'center', color: COLORS.textMuted}}>
            No location category data available
          </div>
        ) : (
          <div style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16
          }}>
            {locationCategoryAOV.map((cat, idx) => (
              <div key={idx} style={{
                padding: 14,
                background: COLORS.bg,
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* Category Summary - More Compact */}
                <div style={{marginBottom: 10}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8}}>
                    <div style={{flex: 1}}>
                      <div style={{fontSize: 13, fontWeight: 600, color: COLORS.text}}>
                        {cat.category}
                      </div>
                      <div style={{fontSize: 10, color: COLORS.textMuted, marginTop: 2}}>
                        {cat.kitchenCount} {cat.kitchenCount === 1 ? 'kitchen' : 'kitchens'} • {formatNumber(cat.totalOrders)} orders
                      </div>
                    </div>
                  </div>
                  
                  {/* AOV Comparison - Compact Horizontal */}
                  <div style={{display: 'flex', gap: 12, marginTop: 6}}>
                    <div style={{flex: 1, padding: '6px 8px', background: 'rgba(5, 150, 105, 0.1)', borderRadius: 4, border: `1px solid ${COLORS.waiter}`}}>
                      <div style={{fontSize: 10, color: COLORS.textMuted, marginBottom: 2}}>Waiter</div>
                      <div style={{fontSize: 16, fontWeight: 700, color: COLORS.waiter}}>
                        AED {cat.waiterAOV.toFixed(2)}
                      </div>
                      <div style={{fontSize: 9, color: COLORS.textMuted}}>
                        {formatNumber(cat.waiterOrderCount)} orders
                      </div>
                    </div>
                    <div style={{flex: 1, padding: '6px 8px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 4, border: `1px solid ${COLORS.api}`}}>
                      <div style={{fontSize: 10, color: COLORS.textMuted, marginBottom: 2}}>Self-Order</div>
                      <div style={{fontSize: 16, fontWeight: 700, color: COLORS.api}}>
                        AED {cat.apiAOV.toFixed(2)}
                      </div>
                      <div style={{fontSize: 9, color: COLORS.textMuted}}>
                        {formatNumber(cat.apiOrderCount)} orders
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kitchen Breakdown - Compact */}
                {cat.kitchens.length > 0 && (
                  <div style={{marginTop: 8, paddingTop: 10, borderTop: `1px solid ${COLORS.border}`, flex: 1}}>
                    <div style={{fontSize: 10, color: COLORS.textMuted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase'}}>
                      Kitchens
                    </div>
                    <ResponsiveContainer width="100%" height={Math.max(150, cat.kitchens.length * 35)}>
                      <BarChart 
                        data={cat.kitchens} 
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={true} vertical={false} />
                        <XAxis 
                          type="number"
                          tick={{ fill: COLORS.textMuted, fontSize: 9 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `AED ${v.toFixed(0)}`}
                        />
                        <YAxis 
                          type="category"
                          dataKey="name"
                          tick={{ fill: COLORS.textMuted, fontSize: 9 }}
                          axisLine={false}
                          tickLine={false}
                          width={110}
                          tickFormatter={(v) => v.length > 18 ? v.substring(0, 18) + '...' : v}
                        />
                        <Tooltip 
                          formatter={(value, name, props) => {
                            const kitchen = props.payload;
                            if (name === 'waiterAOV') {
                              return [`Waiter: AED ${value.toFixed(2)} AOV | ${formatNumber(kitchen.waiterOrderCount)} orders | Total: AED ${formatNumber(kitchen.waiterTotalValue)}`, ''];
                            } else {
                              return [`Self-Order: AED ${value.toFixed(2)} AOV | ${formatNumber(kitchen.apiOrderCount)} orders | Total: AED ${formatNumber(kitchen.apiTotalValue)}`, ''];
                            }
                          }}
                          contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 10 }}
                          itemStyle={{ color: COLORS.text }}
                          labelStyle={{ color: COLORS.text, fontWeight: 600, fontSize: 10 }}
                        />
                        <Bar dataKey="waiterAOV" fill={COLORS.waiter} radius={[0, 3, 3, 0]} name="Waiter AOV" barSize={12} />
                        <Bar dataKey="apiAOV" fill={COLORS.api} radius={[0, 3, 3, 0]} name="Self-Order AOV" barSize={12} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Waiter vs API Performance Comparison */}
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Waiter vs Self-Order - Basket & Addon Analysis</h2>
      </div>

      {/* Key Metrics Comparison */}
      {channelComparison && (
        <>
          {/* Addon Performance Highlight */}
          <div style={{...styles.card, marginTop: 20, background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)'}}>
            <h3 style={{...styles.cardTitle, fontSize: 16, marginBottom: 16}}>Paid Addon Performance Summary</h3>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 20}}>
              <div style={styles.highlightMetric}>
                <div style={styles.highlightLabel}>
                  Paid Addon Attach Rate
                  <InfoTooltip text="Percentage of orders with at least one paid addon. Paid addons have I_MENU_PRICE_B_TAX > 0 (excludes free options like milk type, size).">
                    <span style={styles.infoIcon}>ⓘ</span>
                  </InfoTooltip>
                </div>
                <div style={styles.highlightComparison}>
                  <div>
                    <span style={{color: COLORS.waiter}}>Waiter: </span>
                    <span style={styles.highlightValue}>{channelComparison.waiterMetrics.addonRate.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span style={{color: COLORS.api}}>Self: </span>
                    <span style={{...styles.highlightValue, color: channelComparison.apiMetrics.addonRate > channelComparison.waiterMetrics.addonRate ? '#10B981' : '#EF4444'}}>
                      {channelComparison.apiMetrics.addonRate.toFixed(1)}%
                    </span>
                  </div>
                  <div style={styles.highlightDiff}>
                    {(channelComparison.apiMetrics.addonRate - channelComparison.waiterMetrics.addonRate) >= 0 ? '↑' : '↓'} 
                    {Math.abs(channelComparison.apiMetrics.addonRate - channelComparison.waiterMetrics.addonRate).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div style={styles.highlightMetric}>
                <div style={styles.highlightLabel}>
                  Avg Paid Addons/Order
                  <InfoTooltip text="Total paid addons ÷ Total orders. Shows average across ALL orders including those with 0 addons.">
                    <span style={styles.infoIcon}>ⓘ</span>
                  </InfoTooltip>
                </div>
                <div style={styles.highlightComparison}>
                  <div>
                    <span style={{color: COLORS.waiter}}>Waiter: </span>
                    <span style={styles.highlightValue}>{channelComparison.waiterMetrics.avgAddons.toFixed(2)}</span>
                  </div>
                  <div>
                    <span style={{color: COLORS.api}}>Self: </span>
                    <span style={{...styles.highlightValue, color: channelComparison.apiMetrics.avgAddons > channelComparison.waiterMetrics.avgAddons ? '#10B981' : '#EF4444'}}>
                      {channelComparison.apiMetrics.avgAddons.toFixed(2)}
                    </span>
                  </div>
                  <div style={styles.highlightDiff}>
                    {(channelComparison.apiMetrics.avgAddons - channelComparison.waiterMetrics.avgAddons) >= 0 ? '↑' : '↓'} 
                    {Math.abs(channelComparison.apiMetrics.avgAddons - channelComparison.waiterMetrics.avgAddons).toFixed(2)}
                  </div>
                </div>
              </div>

              <div style={styles.highlightMetric}>
                <div style={styles.highlightLabel}>
                  Addons When Added
                  <InfoTooltip text="Average paid addons only for orders that have at least one paid addon (excludes 0-addon orders).">
                    <span style={styles.infoIcon}>ⓘ</span>
                  </InfoTooltip>
                </div>
                <div style={styles.highlightComparison}>
                  <div>
                    <span style={{color: COLORS.waiter}}>Waiter: </span>
                    <span style={styles.highlightValue}>{channelComparison.waiterMetrics.avgAddonsWhenAdded.toFixed(2)}</span>
                  </div>
                  <div>
                    <span style={{color: COLORS.api}}>Self: </span>
                    <span style={{...styles.highlightValue, color: channelComparison.apiMetrics.avgAddonsWhenAdded > channelComparison.waiterMetrics.avgAddonsWhenAdded ? '#10B981' : '#EF4444'}}>
                      {channelComparison.apiMetrics.avgAddonsWhenAdded.toFixed(2)}
                    </span>
                  </div>
                  <div style={styles.highlightDiff}>
                    {(channelComparison.apiMetrics.avgAddonsWhenAdded - channelComparison.waiterMetrics.avgAddonsWhenAdded) >= 0 ? '↑' : '↓'} 
                    {Math.abs(channelComparison.apiMetrics.avgAddonsWhenAdded - channelComparison.waiterMetrics.avgAddonsWhenAdded).toFixed(2)}
                  </div>
                </div>
              </div>

              <div style={styles.highlightMetric}>
                <div style={styles.highlightLabel}>
                  Avg Addon Revenue
                  <InfoTooltip text="Sum of paid addon prices ÷ Total orders. Average addon revenue per order in AED.">
                    <span style={styles.infoIcon}>ⓘ</span>
                  </InfoTooltip>
                </div>
                <div style={styles.highlightComparison}>
                  <div>
                    <span style={{color: COLORS.waiter}}>Waiter: </span>
                    <span style={styles.highlightValue}>AED {channelComparison.waiterMetrics.avgAddonRevenue.toFixed(0)}</span>
                  </div>
                  <div>
                    <span style={{color: COLORS.api}}>Self: </span>
                    <span style={{...styles.highlightValue, color: channelComparison.apiMetrics.avgAddonRevenue > channelComparison.waiterMetrics.avgAddonRevenue ? '#10B981' : '#EF4444'}}>
                      AED {channelComparison.apiMetrics.avgAddonRevenue.toFixed(0)}
                    </span>
                  </div>
                  <div style={styles.highlightDiff}>
                    {(channelComparison.apiMetrics.avgAddonRevenue - channelComparison.waiterMetrics.avgAddonRevenue) >= 0 ? '↑' : '↓'} 
                    AED {Math.abs(channelComparison.apiMetrics.avgAddonRevenue - channelComparison.waiterMetrics.avgAddonRevenue).toFixed(0)}
                  </div>
                </div>
              </div>

              <div style={styles.highlightMetric}>
                <div style={styles.highlightLabel}>
                  Avg Basket Size
                  <InfoTooltip text="(Items + Paid Addons) ÷ Total orders. Average total items in basket.">
                    <span style={styles.infoIcon}>ⓘ</span>
                  </InfoTooltip>
                </div>
                <div style={styles.highlightComparison}>
                  <div>
                    <span style={{color: COLORS.waiter}}>Waiter: </span>
                    <span style={styles.highlightValue}>{channelComparison.waiterMetrics.avgBasketSize.toFixed(1)}</span>
                  </div>
                  <div>
                    <span style={{color: COLORS.api}}>Self: </span>
                    <span style={{...styles.highlightValue, color: channelComparison.apiMetrics.avgBasketSize > channelComparison.waiterMetrics.avgBasketSize ? '#10B981' : '#EF4444'}}>
                      {channelComparison.apiMetrics.avgBasketSize.toFixed(1)}
                    </span>
                  </div>
                  <div style={styles.highlightDiff}>
                    {(channelComparison.apiMetrics.avgBasketSize - channelComparison.waiterMetrics.avgBasketSize) >= 0 ? '↑' : '↓'} 
                    {Math.abs(channelComparison.apiMetrics.avgBasketSize - channelComparison.waiterMetrics.avgBasketSize).toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{...styles.grid, gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 20}}>
            {/* Waiter Metrics */}
            <div style={styles.card}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12}}>
                <div style={{width: 12, height: 12, borderRadius: 3, background: COLORS.waiter}}></div>
                <h3 style={{...styles.cardTitle, margin: 0}}>Waiter Orders</h3>
              </div>
              <div style={styles.metricValue}>{formatNumber(channelComparison.waiterMetrics.orderCount)}</div>
              <div style={styles.metricLabel}>Total Orders</div>
              <div style={{marginTop: 16}}>
                <div style={styles.metricRow} title="Average number of main items per order">
                  <span>Avg Items/Order <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={styles.metricHighlight}>{channelComparison.waiterMetrics.avgItems.toFixed(1)}</span>
                </div>
                <div style={styles.metricRow} title="Average paid addons per order (excludes free options)">
                  <span>Avg Paid Addons/Order <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={styles.metricHighlight}>{channelComparison.waiterMetrics.avgAddons.toFixed(2)}</span>
                </div>
                <div style={styles.metricRow} title="% of orders with at least one paid addon">
                  <span>Paid Addon Rate <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={styles.metricHighlight}>{channelComparison.waiterMetrics.addonRate.toFixed(1)}%</span>
                </div>
                <div style={styles.metricRow} title="Average revenue from paid addons per order">
                  <span>Avg Addon Revenue <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={styles.metricHighlight}>AED {channelComparison.waiterMetrics.avgAddonRevenue.toFixed(0)}</span>
                </div>
                <div style={styles.metricRow} title="Average Order Value = Total Revenue ÷ Orders">
                  <span>AOV <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={styles.metricHighlight}>AED {channelComparison.waiterMetrics.avgOrderValue.toFixed(0)}</span>
                </div>
              </div>
            </div>

            {/* API Metrics */}
            <div style={styles.card}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12}}>
                <div style={{width: 12, height: 12, borderRadius: 3, background: COLORS.api}}></div>
                <h3 style={{...styles.cardTitle, margin: 0}}>Self-Order Orders</h3>
              </div>
              <div style={styles.metricValue}>{formatNumber(channelComparison.apiMetrics.orderCount)}</div>
              <div style={styles.metricLabel}>Total Orders</div>
              <div style={{marginTop: 16}}>
                <div style={styles.metricRow} title="Average number of main items per order">
                  <span>Avg Items/Order <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={{...styles.metricHighlight, color: channelComparison.apiMetrics.avgItems > channelComparison.waiterMetrics.avgItems ? '#10B981' : '#EF4444'}}>
                    {channelComparison.apiMetrics.avgItems.toFixed(1)}
                  </span>
                </div>
                <div style={styles.metricRow} title="Average paid addons per order (excludes free options)">
                  <span>Avg Paid Addons/Order <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={{...styles.metricHighlight, color: channelComparison.apiMetrics.avgAddons > channelComparison.waiterMetrics.avgAddons ? '#10B981' : '#EF4444'}}>
                    {channelComparison.apiMetrics.avgAddons.toFixed(2)}
                  </span>
                </div>
                <div style={styles.metricRow} title="% of orders with at least one paid addon">
                  <span>Paid Addon Rate <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={{...styles.metricHighlight, color: channelComparison.apiMetrics.addonRate > channelComparison.waiterMetrics.addonRate ? '#10B981' : '#EF4444'}}>
                    {channelComparison.apiMetrics.addonRate.toFixed(1)}%
                  </span>
                </div>
                <div style={styles.metricRow} title="Average revenue from paid addons per order">
                  <span>Avg Addon Revenue <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={{...styles.metricHighlight, color: channelComparison.apiMetrics.avgAddonRevenue > channelComparison.waiterMetrics.avgAddonRevenue ? '#10B981' : '#EF4444'}}>
                    AED {channelComparison.apiMetrics.avgAddonRevenue.toFixed(0)}
                  </span>
                </div>
                <div style={styles.metricRow} title="Average Order Value = Total Revenue ÷ Orders">
                  <span>AOV <span style={styles.tooltipIconSmall}>ⓘ</span></span>
                  <span style={{...styles.metricHighlight, color: channelComparison.apiMetrics.avgOrderValue > channelComparison.waiterMetrics.avgOrderValue ? '#10B981' : '#EF4444'}}>
                    AED {channelComparison.apiMetrics.avgOrderValue.toFixed(0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Difference Summary */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Self-Order vs Waiter Difference</h3>
              <div style={{marginTop: 8}}>
                <div style={styles.metricRow}>
                  <span>Items/Order</span>
                  <span style={{...styles.metricHighlight, color: (channelComparison.apiMetrics.avgItems - channelComparison.waiterMetrics.avgItems) >= 0 ? '#10B981' : '#EF4444'}}>
                    {(channelComparison.apiMetrics.avgItems - channelComparison.waiterMetrics.avgItems) >= 0 ? '+' : ''}
                    {(channelComparison.apiMetrics.avgItems - channelComparison.waiterMetrics.avgItems).toFixed(2)}
                  </span>
                </div>
                <div style={styles.metricRow}>
                  <span>Paid Addons/Order</span>
                  <span style={{...styles.metricHighlight, color: (channelComparison.apiMetrics.avgAddons - channelComparison.waiterMetrics.avgAddons) >= 0 ? '#10B981' : '#EF4444'}}>
                    {(channelComparison.apiMetrics.avgAddons - channelComparison.waiterMetrics.avgAddons) >= 0 ? '+' : ''}
                    {(channelComparison.apiMetrics.avgAddons - channelComparison.waiterMetrics.avgAddons).toFixed(2)}
                  </span>
                </div>
                <div style={styles.metricRow}>
                  <span>Addon Rate</span>
                  <span style={{...styles.metricHighlight, color: (channelComparison.apiMetrics.addonRate - channelComparison.waiterMetrics.addonRate) >= 0 ? '#10B981' : '#EF4444'}}>
                    {(channelComparison.apiMetrics.addonRate - channelComparison.waiterMetrics.addonRate) >= 0 ? '+' : ''}
                    {(channelComparison.apiMetrics.addonRate - channelComparison.waiterMetrics.addonRate).toFixed(1)}%
                  </span>
                </div>
                <div style={styles.metricRow}>
                  <span>Addon Revenue</span>
                  <span style={{...styles.metricHighlight, color: (channelComparison.apiMetrics.avgAddonRevenue - channelComparison.waiterMetrics.avgAddonRevenue) >= 0 ? '#10B981' : '#EF4444'}}>
                    {(channelComparison.apiMetrics.avgAddonRevenue - channelComparison.waiterMetrics.avgAddonRevenue) >= 0 ? '+' : ''}
                    AED {(channelComparison.apiMetrics.avgAddonRevenue - channelComparison.waiterMetrics.avgAddonRevenue).toFixed(0)}
                  </span>
                </div>
                <div style={styles.metricRow}>
                  <span>AOV</span>
                  <span style={{...styles.metricHighlight, color: (channelComparison.apiMetrics.avgOrderValue - channelComparison.waiterMetrics.avgOrderValue) >= 0 ? '#10B981' : '#EF4444'}}>
                    {(channelComparison.apiMetrics.avgOrderValue - channelComparison.waiterMetrics.avgOrderValue) >= 0 ? '+' : ''}
                    AED {(channelComparison.apiMetrics.avgOrderValue - channelComparison.waiterMetrics.avgOrderValue).toFixed(0)}
                  </span>
                </div>
              </div>
            </div>

            {/* AYCE Distribution Pie */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>AYCE vs Non-AYCE Items</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={ayceDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="count"
                    stroke="none"
                  >
                    {ayceDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value, name, props) => [
                      `${formatNumber(value)} (${((value / (ayceDistribution[0]?.count + ayceDistribution[1]?.count || 1)) * 100).toFixed(1)}%)`,
                      props.payload.name
                    ]}
                    contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                    itemStyle={{ color: COLORS.text }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8}}>
                {ayceDistribution.map((d, i) => (
                  <div key={i} style={{display: 'flex', alignItems: 'center', gap: 6}}>
                    <div style={{width: 10, height: 10, borderRadius: 2, background: d.color}}></div>
                    <span style={{fontSize: 12, color: COLORS.textMuted}}>
                      {d.name}: {((d.count / (ayceDistribution[0]?.count + ayceDistribution[1]?.count || 1)) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Basket Size Distribution */}
          <div style={{...styles.card, marginTop: 20}}>
            <h3 style={styles.cardTitle}>Basket Size Distribution (Items + Addons per Order)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={channelComparison.basketDistribution} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                <XAxis 
                  dataKey="bin" 
                  tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                  axisLine={{ stroke: COLORS.border }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                  itemStyle={{ color: COLORS.text }}
                />
                <Bar dataKey="waiter" fill={COLORS.waiter} radius={[4, 4, 0, 0]} name="Waiter" />
                <Bar dataKey="api" fill={COLORS.api} radius={[4, 4, 0, 0]} name="Self-Order" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Addons by Channel */}
          <div style={{...styles.grid, gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 20}}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>
                Top 10 Paid Addons - Waiter Orders
                <InfoTooltip text="Top paid addons ranked by quantity sold. Price shown is average price charged per addon (using I_MENU_PRICE_B_TAX).">
                  <span style={styles.tooltipIcon}>ⓘ</span>
                </InfoTooltip>
              </h3>
              {!channelComparison.hasAddonPricing && (
                <div style={{padding: '8px 12px', background: `${COLORS.danger}20`, borderRadius: 6, marginBottom: 12, fontSize: 12, color: COLORS.danger}}>
                  ⚠️ Addon pricing requires I_MENU_PRICE_B_TAX column. Please use updated data export.
                </div>
              )}
              <div style={styles.addonTable}>
                <div style={styles.addonTableHeader}>
                  <span style={{flex: 2}}>Addon</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Price</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Count</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Revenue</span>
                </div>
                {channelComparison.topWaiterAddons.map((addon, i) => (
                  <div key={i} style={styles.addonTableRow}>
                    <span style={{flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={addon.name}>
                      {addon.name}
                    </span>
                    <span style={{flex: 1, textAlign: 'right', color: COLORS.accent}}>
                      AED {addon.avgPrice.toFixed(0)}
                    </span>
                    <span style={{flex: 1, textAlign: 'right', fontWeight: 600}}>
                      {formatNumber(addon.count)}
                    </span>
                    <span style={{flex: 1, textAlign: 'right', color: COLORS.success}}>
                      AED {formatNumber(addon.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>
                Top 10 Paid Addons - Self-Order Orders
                <InfoTooltip text="Top paid addons ranked by quantity sold. Price shown is average price charged per addon (using I_MENU_PRICE_B_TAX).">
                  <span style={styles.tooltipIcon}>ⓘ</span>
                </InfoTooltip>
              </h3>
              {!channelComparison.hasAddonPricing && (
                <div style={{padding: '8px 12px', background: `${COLORS.danger}20`, borderRadius: 6, marginBottom: 12, fontSize: 12, color: COLORS.danger}}>
                  ⚠️ Addon pricing requires I_MENU_PRICE_B_TAX column. Please use updated data export.
                </div>
              )}
              <div style={styles.addonTable}>
                <div style={styles.addonTableHeader}>
                  <span style={{flex: 2}}>Addon</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Price</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Count</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Revenue</span>
                </div>
                {channelComparison.topApiAddons.map((addon, i) => (
                  <div key={i} style={styles.addonTableRow}>
                    <span style={{flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={addon.name}>
                      {addon.name}
                    </span>
                    <span style={{flex: 1, textAlign: 'right', color: COLORS.accent}}>
                      AED {addon.avgPrice.toFixed(0)}
                    </span>
                    <span style={{flex: 1, textAlign: 'right', fontWeight: 600}}>
                      {formatNumber(addon.count)}
                    </span>
                    <span style={{flex: 1, textAlign: 'right', color: COLORS.success}}>
                      AED {formatNumber(addon.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Category Analytics Section */}
      {categoryAnalytics && (
        <>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Category Analysis - Waiter vs Self-Order</h2>
          </div>

          {/* Per-Order Category Metrics */}
          <div style={{...styles.card, marginTop: 20, background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)'}}>
            <h3 style={{...styles.cardTitle, fontSize: 16, marginBottom: 16}}>
              Average Category Items Per Order
              <InfoTooltip text="Average number of items from each category per order. Helps understand ordering patterns between channels.">
                <span style={styles.tooltipIcon}>ⓘ</span>
              </InfoTooltip>
            </h3>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16}}>
              {[
                { label: 'Mains', waiter: categoryAnalytics.waiterPerOrder.avgMains, api: categoryAnalytics.apiPerOrder.avgMains },
                { label: 'Drinks', waiter: categoryAnalytics.waiterPerOrder.avgDrinks, api: categoryAnalytics.apiPerOrder.avgDrinks },
                { label: 'Sides', waiter: categoryAnalytics.waiterPerOrder.avgSides, api: categoryAnalytics.apiPerOrder.avgSides },
                { label: 'Desserts', waiter: categoryAnalytics.waiterPerOrder.avgDesserts, api: categoryAnalytics.apiPerOrder.avgDesserts },
                { label: 'Kids', waiter: categoryAnalytics.waiterPerOrder.avgKids, api: categoryAnalytics.apiPerOrder.avgKids },
                { label: 'Total Items', waiter: categoryAnalytics.waiterPerOrder.avgTotal, api: categoryAnalytics.apiPerOrder.avgTotal },
              ].map((item, i) => (
                <div key={i} style={styles.highlightMetric}>
                  <div style={styles.highlightLabel}>{item.label}</div>
                  <div style={styles.highlightComparison}>
                    <div>
                      <span style={{color: COLORS.waiter}}>Waiter: </span>
                      <span style={styles.highlightValue}>{item.waiter.toFixed(2)}</span>
                    </div>
                    <div>
                      <span style={{color: COLORS.api}}>Self: </span>
                      <span style={{...styles.highlightValue, color: item.api > item.waiter ? '#10B981' : item.api < item.waiter ? '#EF4444' : COLORS.text}}>
                        {item.api.toFixed(2)}
                      </span>
                    </div>
                    <div style={styles.highlightDiff}>
                      {(item.api - item.waiter) >= 0 ? '↑' : '↓'} {Math.abs(item.api - item.waiter).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{marginTop: 16, display: 'flex', gap: 24, fontSize: 12, color: COLORS.textMuted}}>
              <span>Waiter Orders: {formatNumber(categoryAnalytics.waiterPerOrder.orderCount)}</span>
              <span>Self Orders: {formatNumber(categoryAnalytics.apiPerOrder.orderCount)}</span>
            </div>
          </div>

          {/* Table Size Estimation (Mains per Order) */}
          <div style={{...styles.grid, gridTemplateColumns: '1fr 1fr', marginTop: 20}}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>
                Estimated Table Size (Mains per Order)
                <InfoTooltip text="Distribution of mains ordered per table. More mains typically indicates more people at the table. Compare table sizes between Waiter and API orders.">
                  <span style={styles.tooltipIcon}>ⓘ</span>
                </InfoTooltip>
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryAnalytics.mainsDistData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                  <XAxis 
                    dataKey="mains" 
                    tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                    axisLine={{ stroke: COLORS.border }}
                    tickLine={false}
                    label={{ value: 'Mains Ordered', position: 'bottom', offset: -5, fill: COLORS.textMuted, fontSize: 11 }}
                  />
                  <YAxis 
                    tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                  />
                  <Tooltip 
                    formatter={(value, name) => [formatNumber(value), name === 'waiter' ? 'Waiter' : 'Self-Order']}
                    contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                    itemStyle={{ color: COLORS.text }}
                    labelFormatter={(label) => `${label} Main${label === '1' ? '' : 's'}`}
                  />
                  <Bar dataKey="waiter" fill={COLORS.waiter} name="Waiter" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="api" fill={COLORS.api} name="Self-Order" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              
              {/* Percentage breakdown table */}
              <div style={{marginTop: 16}}>
                <div style={styles.addonTable}>
                  <div style={styles.addonTableHeader}>
                    <span style={{flex: 1}}>Mains</span>
                    <span style={{flex: 1, textAlign: 'center'}}>Waiter</span>
                    <span style={{flex: 1, textAlign: 'center'}}>Waiter %</span>
                    <span style={{flex: 1, textAlign: 'center'}}>Self-Order</span>
                    <span style={{flex: 1, textAlign: 'center'}}>Self %</span>
                  </div>
                  {categoryAnalytics.mainsDistData.map((row, i) => (
                    <div key={i} style={styles.addonTableRow}>
                      <span style={{flex: 1, fontWeight: 500}}>{row.mains} {row.mains === '1' ? 'main' : 'mains'}</span>
                      <span style={{flex: 1, textAlign: 'center', color: COLORS.waiter}}>{formatNumber(row.waiter)}</span>
                      <span style={{flex: 1, textAlign: 'center', color: COLORS.waiter}}>{row.waiterPct.toFixed(1)}%</span>
                      <span style={{flex: 1, textAlign: 'center', color: COLORS.api}}>{formatNumber(row.api)}</span>
                      <span style={{flex: 1, textAlign: 'center', color: COLORS.api}}>{row.apiPct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>
                Table Size Insights
                <InfoTooltip text="Estimated table size based on mains ordered. Toggle to exclude single-main orders (likely solo diners) for multi-guest table comparison.">
                  <span style={styles.tooltipIcon}>ⓘ</span>
                </InfoTooltip>
              </h3>
              
              {/* Toggle for minimum mains */}
              <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16}}>
                <span style={{fontSize: 12, color: COLORS.textMuted}}>Minimum mains per order:</span>
                <div style={styles.toggleGroup}>
                  <button
                    onClick={() => setMinMainsFilter(1)}
                    style={{
                      ...styles.toggleBtn,
                      ...(minMainsFilter === 1 ? styles.toggleBtnActive : {})
                    }}
                  >
                    1+ (All)
                  </button>
                  <button
                    onClick={() => setMinMainsFilter(2)}
                    style={{
                      ...styles.toggleBtn,
                      ...(minMainsFilter === 2 ? styles.toggleBtnActive : {})
                    }}
                  >
                    2+ (Groups)
                  </button>
                </div>
              </div>

              <div style={{padding: '10px 0'}}>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24}}>
                  <div style={{textAlign: 'center', padding: 20, background: `${COLORS.waiter}15`, borderRadius: 12}}>
                    <div style={{fontSize: 12, color: COLORS.textMuted, marginBottom: 8}}>Waiter - Avg Guests/Table</div>
                    <div style={{fontSize: 36, fontWeight: 700, color: COLORS.waiter}}>
                      {(minMainsFilter === 1 ? categoryAnalytics.waiterTableSize.avgMains : categoryAnalytics.waiterTableSize2Plus.avgMains).toFixed(1)}
                    </div>
                    <div style={{fontSize: 11, color: COLORS.textMuted, marginTop: 4}}>
                      Based on {formatNumber(minMainsFilter === 1 ? categoryAnalytics.waiterTableSize.orderCount : categoryAnalytics.waiterTableSize2Plus.orderCount)} orders
                    </div>
                    {minMainsFilter === 2 && (
                      <div style={{fontSize: 10, color: COLORS.accent, marginTop: 2}}>
                        ({formatNumber(categoryAnalytics.singleMainOrders.waiter)} single-main orders excluded)
                      </div>
                    )}
                  </div>
                  <div style={{textAlign: 'center', padding: 20, background: `${COLORS.api}15`, borderRadius: 12}}>
                    <div style={{fontSize: 12, color: COLORS.textMuted, marginBottom: 8}}>Self - Avg Guests/Table</div>
                    <div style={{fontSize: 36, fontWeight: 700, color: COLORS.api}}>
                      {(minMainsFilter === 1 ? categoryAnalytics.apiTableSize.avgMains : categoryAnalytics.apiTableSize2Plus.avgMains).toFixed(1)}
                    </div>
                    <div style={{fontSize: 11, color: COLORS.textMuted, marginTop: 4}}>
                      Based on {formatNumber(minMainsFilter === 1 ? categoryAnalytics.apiTableSize.orderCount : categoryAnalytics.apiTableSize2Plus.orderCount)} orders
                    </div>
                    {minMainsFilter === 2 && (
                      <div style={{fontSize: 10, color: COLORS.accent, marginTop: 2}}>
                        ({formatNumber(categoryAnalytics.singleMainOrders.api)} single-main orders excluded)
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Comparison box */}
                {(() => {
                  const waiterAvg = minMainsFilter === 1 ? categoryAnalytics.waiterTableSize.avgMains : categoryAnalytics.waiterTableSize2Plus.avgMains;
                  const apiAvg = minMainsFilter === 1 ? categoryAnalytics.apiTableSize.avgMains : categoryAnalytics.apiTableSize2Plus.avgMains;
                  const diff = Math.abs(apiAvg - waiterAvg);
                  const pctDiff = waiterAvg > 0 ? (diff / waiterAvg * 100) : 0;
                  
                  return (
                    <div style={{marginTop: 20, padding: 16, background: `${COLORS.card}`, borderRadius: 8, border: `1px solid ${COLORS.border}`}}>
                      <div style={{fontSize: 13, fontWeight: 600, marginBottom: 8}}>
                        {apiAvg > waiterAvg 
                          ? '📈 API orders have larger tables' 
                          : apiAvg < waiterAvg
                            ? '📉 Waiter orders have larger tables'
                            : '📊 Similar table sizes'}
                      </div>
                      <div style={{fontSize: 12, color: COLORS.textMuted}}>
                        Difference: {diff.toFixed(2)} guests/table ({pctDiff.toFixed(1)}%)
                      </div>
                      {minMainsFilter === 1 && (
                        <div style={{fontSize: 11, color: COLORS.textMuted, marginTop: 8}}>
                          Tip: Toggle to "2+ (Groups)" to exclude solo diners and compare multi-guest tables only.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Order Rounds Analysis */}
          {orderRoundsAnalysis && (
            <div style={{...styles.grid, gridTemplateColumns: '1fr 1fr', marginTop: 20}}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>
                  Order Rounds Distribution
                  <InfoTooltip text="Number of times items were added to an order (based on ITEM_CREATED_AT timestamps). Multiple rounds indicate customers adding items over time.">
                    <span style={styles.tooltipIcon}>ⓘ</span>
                  </InfoTooltip>
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={orderRoundsAnalysis.roundsDistData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                    <XAxis 
                      dataKey="rounds" 
                      tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                      axisLine={{ stroke: COLORS.border }}
                      tickLine={false}
                      label={{ value: 'Order Rounds', position: 'bottom', offset: -5, fill: COLORS.textMuted, fontSize: 11 }}
                    />
                    <YAxis 
                      tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                    />
                    <Tooltip 
                      formatter={(value, name) => [formatNumber(value), name === 'waiter' ? 'Waiter' : 'Self-Order']}
                      contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                      itemStyle={{ color: COLORS.text }}
                      labelFormatter={(label) => `${label} Round${label === '1' ? '' : 's'}`}
                    />
                    <Bar dataKey="waiter" fill={COLORS.waiter} name="Waiter" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="api" fill={COLORS.api} name="Self-Order" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                
                {/* Percentage breakdown table */}
                <div style={{marginTop: 16}}>
                  <div style={styles.addonTable}>
                    <div style={styles.addonTableHeader}>
                      <span style={{flex: 1}}>Rounds</span>
                      <span style={{flex: 1, textAlign: 'center'}}>Waiter</span>
                      <span style={{flex: 1, textAlign: 'center'}}>Waiter %</span>
                      <span style={{flex: 1, textAlign: 'center'}}>Waiter Avg</span>
                      <span style={{flex: 1, textAlign: 'center'}}>Self-Order</span>
                      <span style={{flex: 1, textAlign: 'center'}}>Self %</span>
                      <span style={{flex: 1, textAlign: 'center'}}>Self Avg</span>
                    </div>
                    {orderRoundsAnalysis.roundsDistData.map((row, i) => (
                      <div key={i} style={styles.addonTableRow}>
                        <span style={{flex: 1, fontWeight: 500}}>{row.rounds} round{row.rounds === '1' ? '' : 's'}</span>
                        <span style={{flex: 1, textAlign: 'center', color: COLORS.waiter}}>{formatNumber(row.waiter)}</span>
                        <span style={{flex: 1, textAlign: 'center', color: COLORS.waiter}}>{row.waiterPct.toFixed(1)}%</span>
                        <span style={{flex: 1, textAlign: 'center', color: COLORS.waiter}}>AED {row.waiterAvgValue.toFixed(0)}</span>
                        <span style={{flex: 1, textAlign: 'center', color: COLORS.api}}>{formatNumber(row.api)}</span>
                        <span style={{flex: 1, textAlign: 'center', color: COLORS.api}}>{row.apiPct.toFixed(1)}%</span>
                        <span style={{flex: 1, textAlign: 'center', color: COLORS.api}}>AED {row.apiAvgValue.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={styles.card}>
                <h3 style={styles.cardTitle}>
                  Order Rounds Insights
                  <InfoTooltip text="Multi-round orders indicate customers adding items after initial order. Avg Round Value shows average spend per round (using I_MENU_PRICE_B_TAX for accurate pricing).">
                    <span style={styles.tooltipIcon}>ⓘ</span>
                  </InfoTooltip>
                </h3>
                <div style={{padding: '10px 0'}}>
                  {/* Avg Rounds/Order */}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16}}>
                    <div style={{textAlign: 'center', padding: 16, background: `${COLORS.waiter}15`, borderRadius: 12}}>
                      <div style={{fontSize: 11, color: COLORS.textMuted, marginBottom: 4}}>Waiter - Avg Rounds/Order</div>
                      <div style={{fontSize: 28, fontWeight: 700, color: COLORS.waiter}}>
                        {orderRoundsAnalysis.waiterAvgRounds.toFixed(2)}
                      </div>
                      <div style={{fontSize: 10, color: COLORS.textMuted, marginTop: 2}}>
                        {orderRoundsAnalysis.waiterMultiRoundPct.toFixed(1)}% multi-round
                      </div>
                    </div>
                    <div style={{textAlign: 'center', padding: 16, background: `${COLORS.api}15`, borderRadius: 12}}>
                      <div style={{fontSize: 11, color: COLORS.textMuted, marginBottom: 4}}>Self - Avg Rounds/Order</div>
                      <div style={{fontSize: 28, fontWeight: 700, color: COLORS.api}}>
                        {orderRoundsAnalysis.apiAvgRounds.toFixed(2)}
                      </div>
                      <div style={{fontSize: 10, color: COLORS.textMuted, marginTop: 2}}>
                        {orderRoundsAnalysis.apiMultiRoundPct.toFixed(1)}% multi-round
                      </div>
                    </div>
                  </div>
                  
                  {/* Avg Round Value */}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16}}>
                    <div style={{textAlign: 'center', padding: 16, background: `${COLORS.waiter}10`, borderRadius: 12, border: `1px solid ${COLORS.waiter}30`}}>
                      <div style={{fontSize: 11, color: COLORS.textMuted, marginBottom: 4}}>Waiter - Avg Round Value</div>
                      <div style={{fontSize: 28, fontWeight: 700, color: COLORS.waiter}}>
                        AED {orderRoundsAnalysis.waiterAvgRoundValue.toFixed(0)}
                      </div>
                      <div style={{fontSize: 10, color: COLORS.textMuted, marginTop: 2}}>
                        {formatNumber(orderRoundsAnalysis.waiterTotalRounds)} total rounds
                      </div>
                    </div>
                    <div style={{textAlign: 'center', padding: 16, background: `${COLORS.api}10`, borderRadius: 12, border: `1px solid ${COLORS.api}30`}}>
                      <div style={{fontSize: 11, color: COLORS.textMuted, marginBottom: 4}}>Self - Avg Round Value</div>
                      <div style={{fontSize: 28, fontWeight: 700, color: COLORS.api}}>
                        AED {orderRoundsAnalysis.apiAvgRoundValue.toFixed(0)}
                      </div>
                      <div style={{fontSize: 10, color: COLORS.textMuted, marginTop: 2}}>
                        {formatNumber(orderRoundsAnalysis.apiTotalRounds)} total rounds
                      </div>
                    </div>
                  </div>
                  
                  {/* Insights */}
                  <div style={{padding: 12, background: `${COLORS.card}`, borderRadius: 8, border: `1px solid ${COLORS.border}`}}>
                    <div style={{fontSize: 12, fontWeight: 600, marginBottom: 6}}>
                      {orderRoundsAnalysis.apiAvgRoundValue > orderRoundsAnalysis.waiterAvgRoundValue 
                        ? '💰 API rounds have higher value' 
                        : orderRoundsAnalysis.apiAvgRoundValue < orderRoundsAnalysis.waiterAvgRoundValue
                          ? '💰 Waiter rounds have higher value'
                          : '📊 Similar round values'}
                    </div>
                    <div style={{fontSize: 11, color: COLORS.textMuted}}>
                      Round value diff: AED {Math.abs(orderRoundsAnalysis.apiAvgRoundValue - orderRoundsAnalysis.waiterAvgRoundValue).toFixed(0)} 
                      ({orderRoundsAnalysis.waiterAvgRoundValue > 0 ? ((Math.abs(orderRoundsAnalysis.apiAvgRoundValue - orderRoundsAnalysis.waiterAvgRoundValue) / orderRoundsAnalysis.waiterAvgRoundValue) * 100).toFixed(1) : 0}%)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Category Groups Comparison */}
          <div style={{...styles.card, marginTop: 20}}>
            <h3 style={styles.cardTitle}>
              Sales by Category Group
              <InfoTooltip text="Categories grouped into Mains, Drinks, Starters & Sides, Desserts, Kids, AYCE. Shows item count, % of total items per channel, and avg items per order.">
                <span style={styles.tooltipIcon}>ⓘ</span>
              </InfoTooltip>
            </h3>
            <div style={{overflowX: 'auto'}}>
              <div style={{...styles.addonTable, minWidth: 800}}>
                <div style={styles.addonTableHeader}>
                  <span style={{flex: 1.5}}>Category</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Waiter</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Waiter %</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Waiter Avg</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Self-Order</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Self %</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Self Avg</span>
                  <span style={{flex: 1, textAlign: 'right'}}>% Diff</span>
                </div>
                {categoryAnalytics.groups.map((group, i) => {
                  const pctDiff = group.apiPctOfTotal - group.waiterPctOfTotal;
                  return (
                    <div key={i} style={styles.addonTableRow}>
                      <span style={{flex: 1.5, fontWeight: 500}}>{group.name}</span>
                      <span style={{flex: 1, textAlign: 'right', color: COLORS.waiter}}>
                        {formatNumber(group.waiterCount)}
                      </span>
                      <span style={{flex: 1, textAlign: 'right', color: COLORS.waiter}}>
                        {group.waiterPctOfTotal.toFixed(1)}%
                      </span>
                      <span style={{flex: 1, textAlign: 'right', color: COLORS.waiter}}>
                        {group.waiterAvgPerOrder.toFixed(2)}
                      </span>
                      <span style={{flex: 1, textAlign: 'right', color: COLORS.api}}>
                        {formatNumber(group.apiCount)}
                      </span>
                      <span style={{flex: 1, textAlign: 'right', color: COLORS.api}}>
                        {group.apiPctOfTotal.toFixed(1)}%
                      </span>
                      <span style={{flex: 1, textAlign: 'right', color: COLORS.api}}>
                        {group.apiAvgPerOrder.toFixed(2)}
                      </span>
                      <span style={{flex: 1, textAlign: 'right', color: pctDiff > 0.5 ? COLORS.success : pctDiff < -0.5 ? COLORS.danger : COLORS.textMuted}}>
                        {pctDiff > 0 ? '+' : ''}{pctDiff.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Category Groups Chart */}
          <div style={{...styles.grid, gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 20}}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>
                Category Mix by Channel
                <InfoTooltip text="Compare what categories each channel sells more of. Higher API % indicates customers self-ordering more of that category.">
                  <span style={styles.tooltipIcon}>ⓘ</span>
                </InfoTooltip>
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={categoryAnalytics.groups.filter(g => g.name !== 'AYCE' && g.name !== 'Other')} 
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={true} vertical={false} />
                  <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fill: COLORS.textMuted, fontSize: 11 }} 
                    axisLine={false} 
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip 
                    formatter={(value) => formatNumber(value)}
                    contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                    itemStyle={{ color: COLORS.text }}
                  />
                  <Bar dataKey="waiterCount" fill={COLORS.waiter} name="Waiter" radius={[0, 4, 4, 0]} barSize={14} />
                  <Bar dataKey="apiCount" fill={COLORS.api} name="Self-Order" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>
                Self-Order Adoption by Category
                <InfoTooltip text="Percentage of each category sold through Self-Order. Higher = more self-service adoption for that category.">
                  <span style={styles.tooltipIcon}>ⓘ</span>
                </InfoTooltip>
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={categoryAnalytics.groups.filter(g => g.name !== 'AYCE' && g.name !== 'Other' && g.total > 0)} 
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={true} vertical={false} />
                  <XAxis 
                    type="number" 
                    tick={{ fill: COLORS.textMuted, fontSize: 11 }} 
                    axisLine={false} 
                    tickLine={false}
                    domain={[0, 'auto']}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fill: COLORS.textMuted, fontSize: 11 }} 
                    axisLine={false} 
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip 
                    formatter={(value) => `${value.toFixed(1)}%`}
                    contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                    itemStyle={{ color: COLORS.text }}
                  />
                  <Bar dataKey="apiPercent" fill={COLORS.accent} name="Self-Order %" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Category Table */}
          <div style={{...styles.card, marginTop: 20}}>
            <h3 style={styles.cardTitle}>
              All Categories - Detailed Breakdown
              <InfoTooltip text="All categories with sales count and revenue by channel. Sorted by total sales.">
                <span style={styles.tooltipIcon}>ⓘ</span>
              </InfoTooltip>
            </h3>
            <div style={{maxHeight: 400, overflowY: 'auto'}}>
              <div style={styles.addonTable}>
                <div style={{...styles.addonTableHeader, position: 'sticky', top: 0, background: COLORS.card, zIndex: 1}}>
                  <span style={{flex: 2}}>Category</span>
                  <span style={{flex: 1}}>Group</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Waiter</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Self-Order</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Self %</span>
                  <span style={{flex: 1, textAlign: 'right'}}>Revenue</span>
                </div>
                {categoryAnalytics.categories.slice(0, 20).map((cat, i) => (
                  <div key={i} style={styles.addonTableRow}>
                    <span style={{flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={cat.name}>
                      {cat.name}
                    </span>
                    <span style={{flex: 1, fontSize: 11, color: COLORS.textMuted}}>
                      {cat.group}
                    </span>
                    <span style={{flex: 1, textAlign: 'right', color: COLORS.waiter}}>
                      {formatNumber(cat.waiterCount)}
                    </span>
                    <span style={{flex: 1, textAlign: 'right', color: COLORS.api}}>
                      {formatNumber(cat.apiCount)}
                    </span>
                    <span style={{flex: 1, textAlign: 'right', color: cat.apiPercent > 5 ? COLORS.success : COLORS.textMuted}}>
                      {cat.apiPercent.toFixed(1)}%
                    </span>
                    <span style={{flex: 1, textAlign: 'right', color: COLORS.success}}>
                      AED {formatNumber(cat.totalRevenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Item Analytics Section */}
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Item Analytics</h2>
      </div>

      {/* Item Type Distribution */}
      <div style={{...styles.card, marginTop: 20}}>
        <h3 style={styles.cardTitle}>Item Type Distribution</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={itemAnalytics.itemTypeCount} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
            <XAxis 
              dataKey="type" 
              tick={{ fill: COLORS.textMuted, fontSize: 11 }}
              axisLine={{ stroke: COLORS.border }}
              tickLine={false}
              tickFormatter={(v) => v === 'COMBO_ITEM' ? 'Items' : v === 'COMBO_ADDON' ? 'Add-ons' : v}
            />
            <YAxis 
              tick={{ fill: COLORS.textMuted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
            />
            <Tooltip 
              formatter={(value, name) => [formatNumber(value), name === 'count' ? 'Quantity' : 'Revenue']}
              contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
              itemStyle={{ color: COLORS.text }}
              labelFormatter={(label) => label === 'COMBO_ITEM' ? 'Items' : label === 'COMBO_ADDON' ? 'Add-ons' : label}
            />
            <Bar dataKey="count" fill={COLORS.accent} radius={[4, 4, 0, 0]} name="Quantity" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Item Sales and Revenue Charts */}
      <div style={{...styles.grid, gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 20}}>
        {/* Top Items by Count */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Top 30 Items by Sales Count</h3>
          <ResponsiveContainer width="100%" height={750}>
            <BarChart 
              data={itemAnalytics.itemSales} 
              layout="vertical"
              margin={{ top: 10, right: 60, left: 20, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={true} vertical={false} />
              <XAxis 
                type="number"
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                type="category"
                dataKey="name"
                tick={{ fill: COLORS.textMuted, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={160}
                tickFormatter={(v) => v.length > 28 ? v.substring(0, 28) + '...' : v}
              />
              <Tooltip 
                formatter={(value, name, props) => [
                  `${formatNumber(value)} sold | AED ${props.payload.price?.toFixed(0) || 0} each`,
                  'Quantity'
                ]}
                contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                itemStyle={{ color: COLORS.text }}
              />
              <Bar dataKey="count" fill={COLORS.waiter} radius={[0, 4, 4, 0]} name="Quantity" barSize={16}>
                {itemAnalytics.itemSales.map((entry, index) => (
                  <Cell key={index} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Items by Revenue */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Top 30 Items by Revenue (AED)</h3>
          <ResponsiveContainer width="100%" height={750}>
            <BarChart 
              data={itemAnalytics.itemRevenue} 
              layout="vertical"
              margin={{ top: 10, right: 60, left: 20, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={true} vertical={false} />
              <XAxis 
                type="number"
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
              />
              <YAxis 
                type="category"
                dataKey="name"
                tick={{ fill: COLORS.textMuted, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={160}
                tickFormatter={(v) => v.length > 28 ? v.substring(0, 28) + '...' : v}
              />
              <Tooltip 
                formatter={(value, name, props) => [
                  `${formatCurrency(value)} | AED ${props.payload.price?.toFixed(0) || 0} each`,
                  'Revenue'
                ]}
                contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                itemStyle={{ color: COLORS.text }}
              />
              <Bar dataKey="revenue" fill={COLORS.api} radius={[0, 4, 4, 0]} name="Revenue" barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Combo Sales Section */}
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Combo/Position Sales</h2>
      </div>

      <div style={{...styles.grid, gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 20}}>
        {/* Top Combos by Count */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Top 30 Combos by Sales Count</h3>
          <ResponsiveContainer width="100%" height={750}>
            <BarChart 
              data={itemAnalytics.comboSales} 
              layout="vertical"
              margin={{ top: 10, right: 60, left: 20, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={true} vertical={false} />
              <XAxis 
                type="number"
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                type="category"
                dataKey="name"
                tick={{ fill: COLORS.textMuted, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={160}
                tickFormatter={(v) => v.length > 28 ? v.substring(0, 28) + '...' : v}
              />
              <Tooltip 
                formatter={(value, name, props) => [
                  `${formatNumber(value)} sold | AED ${props.payload.price?.toFixed(0) || 0} each`,
                  'Quantity'
                ]}
                contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                itemStyle={{ color: COLORS.text }}
              />
              <Bar dataKey="count" fill="#F59E0B" radius={[0, 4, 4, 0]} name="Quantity" barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Combos by Revenue */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Top 30 Combos by Revenue (AED)</h3>
          <ResponsiveContainer width="100%" height={750}>
            <BarChart 
              data={itemAnalytics.comboRevenue} 
              layout="vertical"
              margin={{ top: 10, right: 60, left: 20, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={true} vertical={false} />
              <XAxis 
                type="number"
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
              />
              <YAxis 
                type="category"
                dataKey="name"
                tick={{ fill: COLORS.textMuted, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={160}
                tickFormatter={(v) => v.length > 28 ? v.substring(0, 28) + '...' : v}
              />
              <Tooltip 
                formatter={(value, name, props) => [
                  `${formatCurrency(value)} | AED ${props.payload.price?.toFixed(0) || 0} each`,
                  'Revenue'
                ]}
                contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                itemStyle={{ color: COLORS.text }}
              />
              <Bar dataKey="revenue" fill="#EC4899" radius={[0, 4, 4, 0]} name="Revenue" barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    backgroundColor: COLORS.bg,
    minHeight: '100vh',
    padding: '32px',
    color: COLORS.text,
    width: '100%',
    boxSizing: 'border-box',
    overflowX: 'hidden',
    overflowY: 'auto',
  },
  uploadScreen: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 64px)',
  },
  uploadCard: {
    background: COLORS.card,
    borderRadius: 20,
    padding: '48px 56px',
    textAlign: 'center',
    border: `1px solid ${COLORS.border}`,
    maxWidth: 480,
  },
  uploadIcon: {
    marginBottom: 24,
  },
  uploadTitle: {
    fontSize: 28,
    fontWeight: 700,
    margin: '0 0 8px 0',
    color: COLORS.text,
  },
  uploadSubtitle: {
    fontSize: 15,
    color: COLORS.textMuted,
    margin: '0 0 32px 0',
  },
  fileInput: {
    display: 'none',
  },
  uploadBtn: {
    display: 'inline-block',
    padding: '14px 32px',
    background: COLORS.accent,
    color: COLORS.bg,
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    boxShadow: `0 4px 20px ${COLORS.accent}40`,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    cursor: 'pointer',
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: COLORS.accent,
    cursor: 'pointer',
  },
  checkboxText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  uploadHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 24,
    lineHeight: 1.5,
  },
  savedFilesSection: {
    marginTop: 32,
    width: '100%',
    textAlign: 'left',
  },
  savedFilesTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.text,
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
  },
  filesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 250,
    overflowY: 'auto',
  },
  savedFileBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
    textAlign: 'left',
  },
  savedFileBtnRecent: {
    border: `1px solid ${COLORS.accent}`,
    background: `${COLORS.accent}10`,
  },
  recentBadge: {
    marginLeft: 8,
    padding: '2px 8px',
    background: COLORS.accent,
    color: '#000',
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 4,
  },
  dividerWithText: {
    display: 'flex',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: COLORS.border,
  },
  dividerText: {
    padding: '0 12px',
    fontSize: 12,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  uploadBtnSecondary: {
    background: 'transparent',
    border: `1px solid ${COLORS.border}`,
    boxShadow: 'none',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  fileDetails: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  fileNameText: {
    fontSize: 13,
    fontWeight: 500,
    color: COLORS.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fileMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    padding: 20,
  },
  noFilesText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    padding: 20,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(15, 23, 42, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    color: COLORS.text,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.02em',
    background: `linear-gradient(135deg, ${COLORS.text} 0%, ${COLORS.accent} 100%)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    margin: '6px 0 0 0',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  fileName: {
    fontSize: 13,
    color: COLORS.textMuted,
    background: COLORS.card,
    padding: '8px 14px',
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
  },
  clearBtn: {
    padding: '8px 14px',
    background: 'transparent',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    color: COLORS.textMuted,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  filtersRow: {
    display: 'flex',
    gap: 32,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  dateInputs: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    padding: '10px 14px',
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    color: COLORS.text,
    fontSize: 13,
    outline: 'none',
    colorScheme: 'dark',
  },
  dateSeparator: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  clearDateBtn: {
    padding: '10px 14px',
    background: 'transparent',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    color: COLORS.textMuted,
    fontSize: 12,
    cursor: 'pointer',
  },
  toggleGroup: {
    display: 'flex',
    gap: 4,
    background: COLORS.card,
    padding: 4,
    borderRadius: 10,
  },
  toggleBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  toggleBtnActive: {
    background: COLORS.accent,
    color: COLORS.bg,
  },
  kitchenFilterRow: {
    marginBottom: 24,
  },
  kitchenTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  kitchenTag: {
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    background: 'transparent',
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  kitchenTagActive: {
    background: COLORS.accent,
    borderColor: COLORS.accent,
    color: COLORS.bg,
  },
  legend: {
    display: 'flex',
    gap: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  legendItemMuted: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginLeft: 'auto',
    opacity: 0.7,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 20,
  },
  card: {
    background: COLORS.card,
    borderRadius: 16,
    padding: 24,
    border: `1px solid ${COLORS.border}`,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.text,
    margin: '0 0 16px 0',
  },
  pieContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  pieStats: {
    display: 'flex',
    gap: 32,
    marginTop: 8,
  },
  pieStat: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  pieStatDot: {
    width: 12,
    height: 40,
    borderRadius: 4,
  },
  pieStatValue: {
    fontSize: 20,
    fontWeight: 700,
    color: COLORS.text,
  },
  pieStatLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  pieStatPercent: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: 600,
  },
  overallAOVGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 20,
  },
  aovSummaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '20px 24px',
    background: COLORS.bg,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
  },
  aovSummaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aovSummaryDot: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  aovSummaryLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  aovSummaryValue: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.text,
  },
  aovSummaryMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  aovSummaryMedian: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: 500,
    marginTop: 2,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: COLORS.text,
    margin: 0,
  },
  itemFilters: {
    display: 'flex',
    gap: 24,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  itemFilterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  itemTypeTags: {
    display: 'flex',
    gap: 6,
  },
  metricValue: {
    fontSize: 32,
    fontWeight: 700,
    color: COLORS.text,
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: `1px solid ${COLORS.border}`,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  metricHighlight: {
    fontWeight: 600,
    color: COLORS.text,
  },
  quickFilters: {
    display: 'flex',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  quickFilterBtn: {
    padding: '4px 10px',
    fontSize: 11,
    background: 'transparent',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 4,
    color: COLORS.textMuted,
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      background: COLORS.border,
      color: COLORS.text,
    },
  },
  highlightMetric: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  highlightLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  infoIcon: {
    fontSize: 10,
    opacity: 0.6,
    cursor: 'help',
  },
  highlightComparison: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
  },
  highlightValue: {
    fontWeight: 700,
    color: COLORS.text,
  },
  highlightDiff: {
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.accent,
    marginTop: 4,
  },
  tooltipIcon: {
    marginLeft: 6,
    fontSize: 12,
    color: COLORS.textMuted,
    cursor: 'help',
    opacity: 0.6,
  },
  tooltipIconSmall: {
    marginLeft: 4,
    fontSize: 10,
    color: COLORS.textMuted,
    cursor: 'help',
    opacity: 0.5,
  },
  infoIconSmall: {
    marginLeft: 4,
    fontSize: 11,
    color: COLORS.textMuted,
    cursor: 'help',
    opacity: 0.6,
  },
  addonTable: {
    marginTop: 12,
  },
  addonTableHeader: {
    display: 'flex',
    padding: '8px 0',
    borderBottom: `2px solid ${COLORS.border}`,
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  addonTableRow: {
    display: 'flex',
    padding: '10px 0',
    borderBottom: `1px solid ${COLORS.border}`,
    fontSize: 13,
    color: COLORS.text,
    alignItems: 'center',
  },
};
