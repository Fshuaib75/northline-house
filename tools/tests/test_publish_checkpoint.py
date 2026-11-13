import importlib.util, pathlib, unittest
from unittest.mock import patch
p=pathlib.Path(__file__).parents[1]/'ig'/'autopost.py'
spec=importlib.util.spec_from_file_location('checkpoint_autopost',p);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class Checkpoints(unittest.TestCase):
 def test_success_reuses_result_and_uncertain_attempt_never_reposts(self):
  state={};saved=[]
  self.assertTrue(hasattr(mod,'checkpoint_call'))
  with patch.object(mod,'graph',return_value={'id':'ok'}) as send:
   self.assertEqual(mod.checkpoint_call(state,'feed',lambda:saved.append(1),'/publish',{}),'ok')
   self.assertEqual(mod.checkpoint_call(state,'feed',lambda:saved.append(1),'/publish',{}),'ok')
   self.assertEqual(send.call_count,1)
  with patch.object(mod,'graph',side_effect=RuntimeError('timeout')) as send:
   with self.assertRaises(RuntimeError):mod.checkpoint_call(state,'story',lambda:None,'/publish',{})
   with self.assertRaises(RuntimeError):mod.checkpoint_call(state,'story',lambda:None,'/publish',{})
   self.assertEqual(send.call_count,1)
