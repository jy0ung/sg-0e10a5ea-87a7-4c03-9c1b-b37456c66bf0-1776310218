import { describe, it, expect } from 'vitest';
import {
  getValidTransitions,
  getStageLabel,
  getStageOrder,
  getResponsibleParty,
  getNextAction,
  canAdvanceStage,
  type DealStage,
} from './dealService';

describe('dealService', () => {
  describe('getStageLabel', () => {
    it('returns correct labels for all stages', () => {
      expect(getStageLabel('lead')).toBe('Lead');
      expect(getStageLabel('prospect')).toBe('Prospect');
      expect(getStageLabel('booking')).toBe('Booking');
      expect(getStageLabel('loan_submission')).toBe('Loan Submission');
      expect(getStageLabel('lou')).toBe('LOU');
      expect(getStageLabel('shipment')).toBe('Shipment');
      expect(getStageLabel('receive')).toBe('Receive');
      expect(getStageLabel('registration')).toBe('Registration');
      expect(getStageLabel('delivery')).toBe('Delivery');
      expect(getStageLabel('disbursement')).toBe('Disbursement');
      expect(getStageLabel('completed')).toBe('Completed');
    });
  });

  describe('getStageOrder', () => {
    it('returns all 11 stages in order', () => {
      const stages = getStageOrder();
      expect(stages).toHaveLength(11);
      expect(stages[0]).toBe('lead');
      expect(stages[10]).toBe('completed');
    });
  });

  describe('getValidTransitions', () => {
    it('lead can only go to prospect', () => {
      expect(getValidTransitions('lead')).toEqual(['prospect']);
    });

    it('prospect can only go to booking', () => {
      expect(getValidTransitions('prospect')).toEqual(['booking']);
    });

    it('booking can only go to loan_submission', () => {
      expect(getValidTransitions('booking')).toEqual(['loan_submission']);
    });

    it('loan_submission can go to lou or booking', () => {
      expect(getValidTransitions('loan_submission')).toEqual(['lou', 'booking']);
    });

    it('completed has no transitions', () => {
      expect(getValidTransitions('completed')).toEqual([]);
    });
  });

  describe('canAdvanceStage', () => {
    it('allows valid transitions', () => {
      expect(canAdvanceStage('lead', 'prospect')).toBe(true);
      expect(canAdvanceStage('booking', 'loan_submission')).toBe(true);
      expect(canAdvanceStage('delivery', 'disbursement')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(canAdvanceStage('lead', 'booking')).toBe(false);
      expect(canAdvanceStage('lead', 'completed')).toBe(false);
      expect(canAdvanceStage('completed', 'lead')).toBe(false);
    });
  });

  describe('getResponsibleParty', () => {
    it('returns Sales Advisor for pre-sales stages', () => {
      expect(getResponsibleParty('lead')).toBe('Sales Advisor');
      expect(getResponsibleParty('prospect')).toBe('Sales Advisor');
      expect(getResponsibleParty('booking')).toBe('Sales Advisor');
      expect(getResponsibleParty('delivery')).toBe('Sales Advisor');
    });

    it('returns Finance Team for finance stages', () => {
      expect(getResponsibleParty('loan_submission')).toBe('Finance Team');
      expect(getResponsibleParty('lou')).toBe('Finance Team');
      expect(getResponsibleParty('disbursement')).toBe('Finance Team');
    });

    it('returns Operations for logistics stages', () => {
      expect(getResponsibleParty('shipment')).toBe('Operations');
      expect(getResponsibleParty('receive')).toBe('Operations');
      expect(getResponsibleParty('registration')).toBe('Operations');
    });
  });

  describe('getNextAction', () => {
    it('returns non-empty strings for all stages', () => {
      const stages: DealStage[] = [
        'lead', 'prospect', 'booking', 'loan_submission', 'lou',
        'shipment', 'receive', 'registration', 'delivery', 'disbursement', 'completed',
      ];
      for (const stage of stages) {
        const action = getNextAction(stage);
        expect(action).toBeTruthy();
        expect(typeof action).toBe('string');
      }
    });
  });
});
