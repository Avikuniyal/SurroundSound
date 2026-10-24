import sys
import tensorflow as tf
import tensorflow_hub as hub
import pytest
from dac.pipeline import Pipeline
from dac.sources import SyntheticSource
from dac.synth import make_scenario
from dac.stub_bearing import StubBearing
from dac.types import ClassState

from test_classifier import (
    YAMNET_HANDLE,
    build_classifier_head,
    load_wav_16k_mono,
    load_yamnet_class_names,
)


def predict_audio_details(audio_path, yamnet_model, custom_model, class_names):
    """
    Processes an audio file and returns both:
    1. YAMNet's top native detected sound label and confidence score.
    2. Custom binary model engine detection probability.
    """
    wav_data = load_wav_16k_mono(audio_path)

    scores, embeddings, _ = yamnet_model(wav_data)

    mean_scores = tf.reduce_mean(scores, axis=0)
    top_class_index = tf.math.argmax(mean_scores).numpy()
    detected_sound_name = class_names[top_class_index]
    yamnet_confidence = float(mean_scores[top_class_index].numpy())

    avg_embedding = tf.math.reduce_mean(embeddings, axis=0, keepdims=True)
    target_probability = float(custom_model(avg_embedding).numpy()[0][0])

    return {
        'detected_sound_name': detected_sound_name,
        'yamnet_confidence': yamnet_confidence,
        'target_sound_probability': target_probability
    }
class FakeClassifier:
    def push(self, t_s, samples):
        pass

    def state(self):
        return ClassState(t_s=0.0, label="other", prob_vehicle=0.0, present=False)


def test_pipeline_l1_alert_always_false():
    """Verify alert is always False in L1 mode, skipping TF if not installed."""
    pytest.importorskip("tensorflow")

    scenario = make_scenario("approach_0deg")
    source = SyntheticSource(scenario)
    stub = StubBearing(lambda t_s: scenario.truth(t_s)["bearing_deg"])

    pipeline = Pipeline(bearing_fn=stub.estimate, mode="L1", classifier=FakeClassifier())

    for t_s, block in source:
        msg = pipeline.process_block(t_s, block)
        assert msg["alert"] is False


if __name__ == '__main__':
    # Determine test file path
    test_file = sys.argv[1] if len(sys.argv) > 1 else 'test_data/miaow_16k.wav'

    print('Initializing models...')
    yamnet_model = hub.load(YAMNET_HANDLE)
    class_names = load_yamnet_class_names(yamnet_model)
    classifier_head = build_classifier_head()

    print(f'\nRunning analysis on: {test_file}')
    results = predict_audio_details(test_file, yamnet_model, classifier_head, class_names)

    print('\n--- Prediction Results ---')
    print(f"Top Detected Sound Label:  {results['detected_sound_name']} ({results['yamnet_confidence'] * 100:.2f}% confidence)")
    print(f"Custom Engine Probability: {results['target_sound_probability'] * 100:.2f}%")