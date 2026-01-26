import React from 'react';
import { cn } from '../../lib/utils';

export const Skeleton = ({ className, ...props }) => {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-pharma-grey-pale",
        className
      )}
      {...props}
    />
  );
};

export const SkeletonCard = ({ className }) => (
  <div className={cn("bg-white rounded-2xl p-6 shadow-card", className)}>
    <Skeleton className="h-4 w-3/4 mb-4" />
    <Skeleton className="h-3 w-full mb-2" />
    <Skeleton className="h-3 w-2/3" />
  </div>
);

export const SkeletonPharmacyCard = () => (
  <div className="bg-white rounded-2xl p-6 shadow-card">
    <div className="flex items-start gap-4">
      <Skeleton className="w-16 h-16 rounded-xl" />
      <div className="flex-1">
        <Skeleton className="h-5 w-48 mb-2" />
        <Skeleton className="h-3 w-32 mb-3" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  </div>
);

export const SkeletonMedicineCard = () => (
  <div className="bg-white rounded-2xl p-5 shadow-card">
    <div className="flex justify-between items-start mb-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-6 w-24 rounded-full" />
    </div>
    <Skeleton className="h-3 w-full mb-2" />
    <Skeleton className="h-3 w-2/3" />
  </div>
);

export const SkeletonList = ({ count = 3, CardComponent = SkeletonCard }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <CardComponent key={i} />
    ))}
  </div>
);
