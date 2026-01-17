import React, { useState } from 'react';
import { X, Calendar as CalendarIcon } from 'lucide-react';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format } from 'date-fns';

interface RescheduleDatePickerProps {
  currentDate: string;
  onSelect: (date: string) => void;
  onCancel: () => void;
}

export default function RescheduleDatePicker({
  currentDate,
  onSelect,
  onCancel,
}: RescheduleDatePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    try {
      return new Date(currentDate + 'T12:00:00');
    } catch {
      return new Date();
    }
  });

  const handleConfirm = () => {
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      onSelect(`${year}-${month}-${day}`);
    }
  };

  const formatDate = (date: Date) => {
    return format(date, 'EEEE, MMMM d, yyyy');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.5))'
        }}
        onClick={onCancel}
      />

      {/* Panel with glassmorphism */}
      <div
        className="relative w-full max-w-lg mx-4 mb-4 p-6 rounded-2xl backdrop-blur-xl border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] animate-slide-up"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.01) 100%)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/20 text-white/60 hover:text-white hover:bg-white/[0.12] transition-all"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <CalendarIcon className="h-5 w-5 text-white/70" />
          <h3 className="text-lg font-light text-white">Select new date</h3>
        </div>

        {/* Selected date display */}
        {selectedDate && (
          <div className="mb-4 p-3 rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/10">
            <p className="text-xs text-white/60 font-light mb-1">Selected date:</p>
            <p className="text-sm text-white font-light">{formatDate(selectedDate)}</p>
          </div>
        )}

        {/* Calendar */}
        <div className="mb-4">
          <CalendarPicker
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className="rounded-xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-4"
            classNames={{
              months: "flex flex-col space-y-4",
              month: "space-y-4",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-sm font-light text-white",
              nav: "space-x-1 flex items-center",
              nav_button: "h-7 w-7 bg-white/[0.08] backdrop-blur-md border border-white/20 text-white/80 hover:bg-white/[0.12] hover:border-white/30 rounded-md transition-all",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              head_cell: "text-white/60 rounded-md w-9 font-light text-xs",
              row: "flex w-full mt-2",
              cell: "h-9 w-9 text-center text-sm p-0 relative",
              day: "h-9 w-9 p-0 font-light text-white/80 hover:bg-white/[0.12] hover:text-white rounded-md transition-all",
              day_selected: "bg-white/20 text-white hover:bg-white/25 focus:bg-white/25 rounded-md",
              day_today: "bg-white/[0.08] text-white rounded-md",
              day_outside: "text-white/40 opacity-50",
              day_disabled: "text-white/30 opacity-30",
              day_hidden: "invisible",
            }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl font-light text-white/60 hover:text-white/80 bg-white/[0.05] backdrop-blur-md border-2 border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDate}
            className="flex-1 px-4 py-3 rounded-xl font-light backdrop-blur-md border-2 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: selectedDate ? 'rgba(34, 197, 94, 0.6)' : 'rgba(255, 255, 255, 0.05)',
              borderColor: selectedDate ? 'rgba(34, 197, 94, 0.8)' : 'rgba(255, 255, 255, 0.1)',
            }}
          >
            Select date
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
