/* eslint-disable react-hooks/exhaustive-deps */

'use client';

import React, { useEffect, useState } from 'react';

import { tt } from '@/lib/i18n.client';

interface WeekdaySelectorProps {
  onWeekdayChange: (weekday: string) => void;
  className?: string;
}

const WeekdaySelector: React.FC<WeekdaySelectorProps> = ({
  onWeekdayChange,
  className = '',
}) => {
  const weekdays = [
    { value: 'Mon', label: tt('Monday', '周一', '週一'), shortLabel: tt('Mon', '周一', '週一') },
    { value: 'Tue', label: tt('Tuesday', '周二', '週二'), shortLabel: tt('Tue', '周二', '週二') },
    { value: 'Wed', label: tt('Wednesday', '周三', '週三'), shortLabel: tt('Wed', '周三', '週三') },
    { value: 'Thu', label: tt('Thursday', '周四', '週四'), shortLabel: tt('Thu', '周四', '週四') },
    { value: 'Fri', label: tt('Friday', '周五', '週五'), shortLabel: tt('Fri', '周五', '週五') },
    { value: 'Sat', label: tt('Saturday', '周六', '週六'), shortLabel: tt('Sat', '周六', '週六') },
    { value: 'Sun', label: tt('Sunday', '周日', '週日'), shortLabel: tt('Sun', '周日', '週日') },
  ];

  // 获取今天的星期数，默认选中今天
  const getTodayWeekday = (): string => {
    const today = new Date().getDay();
    // getDay() 返回 0-6，0 是周日，1-6 是周一到周六
    const weekdayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return weekdayMap[today];
  };

  const [selectedWeekday, setSelectedWeekday] = useState<string>(
    getTodayWeekday()
  );

  // 组件初始化时通知父组件默认选中的星期
  useEffect(() => {
    onWeekdayChange(getTodayWeekday());
  }, []); // 只在组件挂载时执行一次

  return (
    <div
      className={`relative inline-flex rounded-full p-0.5 sm:p-1 ${className}`}
    >
      {weekdays.map((weekday) => {
        const isActive = selectedWeekday === weekday.value;
        return (
          <button
            key={weekday.value}
            onClick={() => {
              setSelectedWeekday(weekday.value);
              onWeekdayChange(weekday.value);
            }}
            className={`
              relative z-10 px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap
              ${
                isActive
                  ? 'text-green-600 dark:text-green-400 font-semibold'
                  : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer'
              }
            `}
            title={weekday.label}
          >
            {weekday.shortLabel}
          </button>
        );
      })}
    </div>
  );
};

export default WeekdaySelector;
