import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Menu, User, Upload, Download, Link, Package, Settings, Activity,
  Plus, Trash2, Check, X, AlertTriangle
} from 'lucide-react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { SPORT_COLORS } from '@/lib/context-utils';
import { supabase } from '@/lib/supabase';

// Icons for gear types
const RunningShoeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
    <path d="M4 17.5c0-1 .5-2 1.5-2.5l3-1.5c1-.5 2-1.5 2.5-2.5l1-2c.5-1 1.5-1.5 2.5-1.5h3c1 0 2 .5 2.5 1.5l1 2c.5 1 1.5 2 2.5 2.5l1 .5v4c0 .5-.5 1-1 1H5c-.5 0-1-.5-1-1v-1z" />
    <path d="M8 14.5l2-1" />
    <path d="M11 13l2-1" />
  </svg>
);

const BikeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 6h2l3 6.5" />
    <path d="M12 17.5L9 10l6-1" />
    <path d="M5.5 17.5l4-7.5h6" />
  </svg>
);

interface GearItem {
  id: string;
  type: 'shoe' | 'bike';
  name: string;
  brand?: string;
  model?: string;
  is_default: boolean;
  purchase_date?: string;
  starting_distance?: number;
  total_distance: number;
  retired: boolean;
  notes?: string;
}

interface GearProps {
  onClose: () => void;
}

// Common brands and models for autocomplete
const SHOE_BRANDS = [
  'Nike', 'Hoka', 'Brooks', 'Asics', 'New Balance', 'Saucony', 'Adidas', 
  'On', 'Altra', 'Mizuno', 'Puma', 'Reebok', 'Under Armour', 'Salomon'
];

const SHOE_MODELS: Record<string, string[]> = {
  'Nike': ['Pegasus', 'Vaporfly', 'Alphafly', 'Invincible', 'Zoom Fly', 'Structure', 'Vomero', 'React Infinity'],
  'Hoka': ['Clifton', 'Bondi', 'Mach', 'Rincon', 'Speedgoat', 'Arahi', 'Gaviota', 'Carbon X'],
  'Brooks': ['Ghost', 'Glycerin', 'Adrenaline', 'Launch', 'Hyperion', 'Levitate', 'Cascadia'],
  'Asics': ['Gel-Nimbus', 'Gel-Kayano', 'Novablast', 'Metaspeed', 'GT-2000', 'Cumulus', 'Superblast'],
  'New Balance': ['Fresh Foam 1080', 'FuelCell', 'Fresh Foam 880', 'Fresh Foam More', 'Rebel', 'SuperComp'],
  'Saucony': ['Kinvara', 'Endorphin', 'Triumph', 'Guide', 'Ride', 'Peregrine', 'Hurricane'],
  'Adidas': ['Ultraboost', 'Adizero', 'Supernova', 'Solar Glide', 'Adistar', 'Boston'],
  'On': ['Cloudmonster', 'Cloudsurfer', 'Cloudflow', 'Cloudstratus', 'Cloudrunner', 'Cloudboom'],
  'Altra': ['Torin', 'Rivera', 'Escalante', 'Lone Peak', 'Olympus', 'Provision'],
  'Mizuno': ['Wave Rider', 'Wave Inspire', 'Wave Sky', 'Wave Rebellion', 'Wave Neo'],
};

const BIKE_BRANDS = [
  'Trek', 'Specialized', 'Giant', 'Cannondale', 'Canyon', 'Cervélo', 'Pinarello',
  'Scott', 'BMC', 'Bianchi', 'Factor', 'Colnago', 'Felt', 'Orbea', 'Wilier'
];

const BIKE_MODELS: Record<string, string[]> = {
  'Trek': ['Domane', 'Émonda', 'Madone', 'Checkpoint', 'FX', 'Fuel EX'],
  'Specialized': ['Tarmac', 'Roubaix', 'Diverge', 'Allez', 'Venge', 'Aethos', 'Crux'],
  'Giant': ['Defy', 'TCR', 'Propel', 'Revolt', 'Contend', 'Escape'],
  'Cannondale': ['Synapse', 'SuperSix', 'CAAD', 'Topstone', 'SystemSix'],
  'Canyon': ['Endurance', 'Ultimate', 'Aeroad', 'Grail', 'Endurace', 'Speedmax', 'Inflite', 'Grizl'],
  'Cervélo': ['R5', 'S5', 'Caledonia', 'Áspero', 'Soloist'],
  'Scott': ['Addict', 'Foil', 'Speedster', 'Contessa'],
  'BMC': ['Roadmachine', 'Teammachine', 'Timemachine'],
};

export default function Gear({ onClose }: GearProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shoes, setShoes] = useState<GearItem[]>([]);
  const [bikes, setBikes] = useState<GearItem[]>([]);
  const [activeTab, setActiveTab] = useState<'shoes' | 'bikes'>('shoes');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state for new gear
  const [newGear, setNewGear] = useState({
    name: '',
    brand: '',
    model: '',
    purchase_date: '',
    starting_miles: '', // Store as string for input, convert to meters on save
    notes: ''
  });

  useEffect(() => {
    loadGear();
  }, []);

  const loadGear = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('gear')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) {
        console.error('Error loading gear:', error);
        // If table doesn't exist yet, just use empty arrays
        setShoes([]);
        setBikes([]);
        return;
      }

      const gearItems = (data || []) as GearItem[];
      setShoes(gearItems.filter(g => g.type === 'shoe' && !g.retired));
      setBikes(gearItems.filter(g => g.type === 'bike' && !g.retired));
    } catch (e) {
      console.error('Error loading gear:', e);
    } finally {
      setLoading(false);
    }
  };

  const addGear = async () => {
    if (!newGear.name.trim()) return;
    
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const gearType = activeTab === 'shoes' ? 'shoe' : 'bike';
      const existingItems = activeTab === 'shoes' ? shoes : bikes;
      
      const newItem: Partial<GearItem> = {
        type: gearType,
        name: newGear.name.trim(),
        brand: newGear.brand.trim() || undefined,
        model: newGear.model.trim() || undefined,
        is_default: existingItems.length === 0, // First item becomes default
        purchase_date: newGear.purchase_date || undefined,
        starting_distance: (parseFloat(newGear.starting_miles) || 0) * 1609.34, // Convert miles to meters
        total_distance: (parseFloat(newGear.starting_miles) || 0) * 1609.34,
        retired: false,
        notes: newGear.notes.trim() || undefined
      };

      const { data, error } = await supabase
        .from('gear')
        .insert({ ...newItem, user_id: user.id })
        .select()
        .single();

      if (error) {
        console.error('Error adding gear:', error);
        alert('Failed to add gear. Make sure the gear table exists.');
        return;
      }

      if (activeTab === 'shoes') {
        setShoes([...shoes, data as GearItem]);
      } else {
        setBikes([...bikes, data as GearItem]);
      }

      setNewGear({ name: '', brand: '', model: '', purchase_date: '', starting_miles: '', notes: '' });
      setShowAddForm(false);
    } catch (e) {
      console.error('Error adding gear:', e);
    } finally {
      setSaving(false);
    }
  };

  const setAsDefault = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const gearType = activeTab === 'shoes' ? 'shoe' : 'bike';
      
      // Clear all defaults for this type
      await supabase
        .from('gear')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('type', gearType);
      
      // Set new default
      await supabase
        .from('gear')
        .update({ is_default: true })
        .eq('id', id);

      // Update local state
      if (activeTab === 'shoes') {
        setShoes(shoes.map(s => ({ ...s, is_default: s.id === id })));
      } else {
        setBikes(bikes.map(b => ({ ...b, is_default: b.id === id })));
      }
    } catch (e) {
      console.error('Error setting default:', e);
    }
  };

  const retireGear = async (id: string) => {
    try {
      await supabase
        .from('gear')
        .update({ retired: true })
        .eq('id', id);

      if (activeTab === 'shoes') {
        setShoes(shoes.filter(s => s.id !== id));
      } else {
        setBikes(bikes.filter(b => b.id !== id));
      }
    } catch (e) {
      console.error('Error retiring gear:', e);
    }
  };

  const formatDistance = (meters: number) => {
    const miles = meters / 1609.34;
    return `${miles.toFixed(0)} mi`;
  };

  const getGearColor = () => activeTab === 'shoes' ? SPORT_COLORS.run : SPORT_COLORS.cycling;

  const currentItems = activeTab === 'shoes' ? shoes : bikes;

  return (
    <div className="mobile-app-container">
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full px-4">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-white/80 hover:text-white transition-colors p-2">
                    <Menu className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => navigate('/baselines')}>
                    <Activity className="mr-2 h-4 w-4" />
                    Training Baselines
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/connections')}>
                    <Link className="mr-2 h-4 w-4" />
                    Connections
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/gear')}>
                    <Package className="mr-2 h-4 w-4" />
                    Gear
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Download className="mr-2 h-4 w-4" />
                    Import
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Upload className="mr-2 h-4 w-4" />
                    Export Data
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Help & Support
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/')}>
                    Sign Out
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/plans/admin')}>
                    <Settings className="mr-2 h-4 w-4" />
                    Admin – Add template (JSON)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <h1 className="text-3xl font-extralight tracking-widest text-white">efforts</h1>
            </div>
          </div>
          <div className="px-4 pb-2">
            <h2 className="text-2xl font-bold text-white">Gear</h2>
          </div>
        </div>
      </header>

      <main className="mobile-main-content">
        <div className="max-w-2xl mx-auto px-4 pb-6">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-white/60">Loading your gear...</p>
            </div>
          ) : (
            <div className="space-y-5 mt-8">
              {/* Description */}
              <div className="text-center mb-4">
                <p className="text-white/50 text-sm">Track mileage on your running shoes and bikes</p>
              </div>

              {/* Tabs: Shoes / Bikes */}
              <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setActiveTab('shoes')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all duration-300 ${
                      activeTab === 'shoes' ? 'text-white' : 'border-white/15 bg-white/[0.04] text-white/50'
                    }`}
                    style={{
                      ...(activeTab === 'shoes' ? {
                        borderColor: SPORT_COLORS.run,
                        backgroundColor: `${SPORT_COLORS.run}15`,
                        boxShadow: `0 0 20px ${SPORT_COLORS.run}20`
                      } : {})
                    }}
                  >
                    <RunningShoeIcon />
                    <span className="font-medium">Shoes</span>
                    {shoes.length > 0 && (
                      <span 
                        className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${SPORT_COLORS.run}30`, color: SPORT_COLORS.run }}
                      >
                        {shoes.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('bikes')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all duration-300 ${
                      activeTab === 'bikes' ? 'text-white' : 'border-white/15 bg-white/[0.04] text-white/50'
                    }`}
                    style={{
                      ...(activeTab === 'bikes' ? {
                        borderColor: SPORT_COLORS.cycling,
                        backgroundColor: `${SPORT_COLORS.cycling}15`,
                        boxShadow: `0 0 20px ${SPORT_COLORS.cycling}20`
                      } : {})
                    }}
                  >
                    <BikeIcon />
                    <span className="font-medium">Bikes</span>
                    {bikes.length > 0 && (
                      <span 
                        className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${SPORT_COLORS.cycling}30`, color: SPORT_COLORS.cycling }}
                      >
                        {bikes.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Gear List */}
                {currentItems.length === 0 && !showAddForm ? (
                  <div className="text-center py-8">
                    <div 
                      className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${getGearColor()}15` }}
                    >
                      {activeTab === 'shoes' ? <RunningShoeIcon /> : <BikeIcon />}
                    </div>
                    <p className="text-white/50 mb-4">
                      No {activeTab === 'shoes' ? 'running shoes' : 'bikes'} added yet
                    </p>
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{ 
                        backgroundColor: `${getGearColor()}20`,
                        color: getGearColor(),
                        border: `1px solid ${getGearColor()}40`
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Add {activeTab === 'shoes' ? 'Shoe' : 'Bike'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl border transition-all duration-300"
                        style={{
                          backgroundColor: item.is_default ? `${getGearColor()}08` : 'rgba(255,255,255,0.03)',
                          borderColor: item.is_default ? `${getGearColor()}40` : 'rgba(255,255,255,0.1)'
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">{item.name}</span>
                              {item.is_default && (
                                <span 
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: getGearColor(), color: '#000' }}
                                >
                                  DEFAULT
                                </span>
                              )}
                            </div>
                            {(item.brand || item.model) && (
                              <p className="text-sm text-white/50 mt-0.5">
                                {[item.brand, item.model].filter(Boolean).join(' ')}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-sm" style={{ color: getGearColor() }}>
                                {formatDistance(item.total_distance)}
                              </span>
                              {item.total_distance > (activeTab === 'shoes' ? 643738 : 8046720) && (
                                <span className="flex items-center gap-1 text-xs text-amber-400">
                                  <AlertTriangle className="w-3 h-3" />
                                  High mileage
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {!item.is_default && (
                              <button
                                onClick={() => setAsDefault(item.id)}
                                className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                                title="Set as default"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => retireGear(item.id)}
                              className="p-2 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                              title="Retire"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Add Button */}
                    {!showAddForm && (
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="w-full p-3 rounded-xl border border-dashed border-white/20 text-white/50 hover:border-white/40 hover:text-white/70 hover:bg-white/[0.02] transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add {activeTab === 'shoes' ? 'Shoe' : 'Bike'}
                      </button>
                    )}
                  </div>
                )}

                {/* Add Form */}
                {showAddForm && (
                  <div 
                    className="mt-4 p-4 rounded-xl border"
                    style={{
                      backgroundColor: `${getGearColor()}08`,
                      borderColor: `${getGearColor()}30`
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium text-white">
                        Add {activeTab === 'shoes' ? 'Running Shoe' : 'Bike'}
                      </h3>
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="p-1 rounded hover:bg-white/10 text-white/50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-white/50 font-medium mb-1.5 block">Name *</label>
                        <input
                          type="text"
                          value={newGear.name}
                          onChange={(e) => setNewGear({ ...newGear, name: e.target.value })}
                          placeholder={activeTab === 'shoes' ? 'e.g. Daily Trainers' : 'e.g. Road Bike'}
                          className="w-full h-11 px-3 text-sm bg-white/[0.06] backdrop-blur-lg border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/50 font-medium mb-1.5 block">Brand</label>
                          <input
                            type="text"
                            list={activeTab === 'shoes' ? 'shoe-brands' : 'bike-brands'}
                            value={newGear.brand}
                            onChange={(e) => setNewGear({ ...newGear, brand: e.target.value, model: '' })}
                            placeholder={activeTab === 'shoes' ? 'Nike, Hoka...' : 'Trek, Specialized...'}
                            className="w-full h-11 px-3 text-sm bg-white/[0.06] backdrop-blur-lg border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                          />
                          <datalist id="shoe-brands">
                            {SHOE_BRANDS.map(brand => <option key={brand} value={brand} />)}
                          </datalist>
                          <datalist id="bike-brands">
                            {BIKE_BRANDS.map(brand => <option key={brand} value={brand} />)}
                          </datalist>
                        </div>
                        <div>
                          <label className="text-xs text-white/50 font-medium mb-1.5 block">Model</label>
                          <input
                            type="text"
                            list={`${newGear.brand.toLowerCase().replace(/\s+/g, '-')}-models`}
                            value={newGear.model}
                            onChange={(e) => setNewGear({ ...newGear, model: e.target.value })}
                            placeholder={activeTab === 'shoes' ? 'Pegasus 40' : 'Domane SL5'}
                            className="w-full h-11 px-3 text-sm bg-white/[0.06] backdrop-blur-lg border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                          />
                          {/* Dynamic model datalists based on selected brand */}
                          {activeTab === 'shoes' && Object.entries(SHOE_MODELS).map(([brand, models]) => (
                            <datalist key={brand} id={`${brand.toLowerCase().replace(/\s+/g, '-')}-models`}>
                              {models.map(model => <option key={model} value={model} />)}
                            </datalist>
                          ))}
                          {activeTab === 'bikes' && Object.entries(BIKE_MODELS).map(([brand, models]) => (
                            <datalist key={brand} id={`${brand.toLowerCase().replace(/\s+/g, '-')}-models`}>
                              {models.map(model => <option key={model} value={model} />)}
                            </datalist>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/50 font-medium mb-1.5 block">Starting Miles</label>
                          <input
                            type="number"
                            value={newGear.starting_miles}
                            onChange={(e) => setNewGear({ ...newGear, starting_miles: e.target.value })}
                            placeholder="0"
                            className="w-full h-11 px-3 text-sm bg-white/[0.06] backdrop-blur-lg border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/50 font-medium mb-1.5 block">Purchase Date</label>
                          <input
                            type="date"
                            value={newGear.purchase_date}
                            onChange={(e) => setNewGear({ ...newGear, purchase_date: e.target.value })}
                            className="w-full h-11 px-3 text-sm bg-white/[0.06] backdrop-blur-lg border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                          />
                        </div>
                      </div>

                      <button
                        onClick={addGear}
                        disabled={!newGear.name.trim() || saving}
                        className="w-full py-3 rounded-xl font-medium text-black transition-all disabled:opacity-50"
                        style={{ backgroundColor: getGearColor() }}
                      >
                        {saving ? 'Saving...' : `Add ${activeTab === 'shoes' ? 'Shoe' : 'Bike'}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Info card */}
              <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
                <h3 className="text-sm font-semibold text-white/90 mb-2">How it works</h3>
                <ul className="text-xs text-white/50 space-y-1.5">
                  <li>• Set a default shoe/bike for each activity type</li>
                  <li>• After each workout, confirm or switch gear in the post-activity popup</li>
                  <li>• Distance is automatically tracked from synced activities</li>
                  <li>• Get alerts when shoes approach 400+ miles</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

